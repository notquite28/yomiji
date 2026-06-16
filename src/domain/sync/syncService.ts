import { WaniKaniApiError, WaniKaniClient } from '../api/WaniKaniClient';
import { LessonStartPayload, ReviewProgressPayload, StudyMaterialData, StudyMaterialPayload } from '../api/types';
import {
  AppDatabase,
  clearRemoteCache,
  getSyncCursors,
  putAssignments,
  putLevelProgressions,
  putReviewStats,
  putStudyMaterials,
  putSubjects,
  putUser,
  putVoiceActors,
  setSyncCursor,
} from '../db/database';
import { findBySubjectId, putStudyMaterialResource } from '../db/studyMaterialRepository';
import { classifySyncError, logSyncError, SyncErrorCategory } from '../db/errorLog';

export type SyncStep =
  | 'pending-progress'
  | 'pending-study-materials'
  | 'user'
  | 'subjects'
  | 'assignments'
  | 'study-materials'
  | 'level-progressions'
  | 'voice-actors'
  | 'review-statistics'
  | 'complete';

export class SyncError extends Error {
  readonly category: SyncErrorCategory;
  readonly isRetryable: boolean;

  constructor(message: string, category: SyncErrorCategory, isRetryable: boolean = true) {
    super(message);
    this.name = 'SyncError';
    this.category = category;
    this.isRetryable = isRetryable;
  }
}

export type SyncProgress = {
  step: SyncStep;
  label: string;
  completed: number;
  total: number;
};

export type SyncOptions = {
  db: AppDatabase;
  client: WaniKaniClient;
  onProgress?: (progress: SyncProgress) => void;
  onCheckpoint?: () => void | Promise<void>;
};

let activeSync: Promise<void> | null = null;
let activeFullRefresh: Promise<void> | null = null;

const DOWNLOAD_REQUEST_RESERVE = 21;

export function runIncrementalSync(options: SyncOptions) {
  if (activeSync) {
    return activeSync;
  }

  activeSync = trackActiveSync((async () => {
    await runPendingOnly(options, 'before-download');
    await runDownloadSync(options);
  })());
  return activeSync;
}

function trackActiveSync(sync: Promise<void>) {
  const tracked = sync.finally(() => {
    if (activeSync === tracked) {
      activeSync = null;
    }
  });
  return tracked;
}

export function runPendingSync(options: SyncOptions) {
  if (activeSync) {
    return activeSync;
  }

  activeSync = trackActiveSync(runPendingOnly(options, 'standalone'));
  return activeSync;
}

export async function hasPendingWrites(db: AppDatabase) {
  const row = await db.getFirstAsync<{ value: number }>(
    `SELECT
       (SELECT COUNT(*) FROM pending_progress) +
       (SELECT COUNT(*) FROM pending_study_materials) AS value`,
  );
  return (row?.value ?? 0) > 0;
}

async function runPendingOnly({ db, client, onProgress }: SyncOptions, mode: 'standalone' | 'before-download') {
  if (!(await hasPendingWrites(db))) {
    return;
  }

  const reserve = mode === 'before-download' ? DOWNLOAD_REQUEST_RESERVE : 0;
  const budget = Math.max(0, client.requestsRemainingInInterval - reserve);
  let remainingBudget = budget;

  try {
    onProgress?.({ step: 'pending-progress', label: 'Sending queued lesson and review progress', completed: 0, total: 2 });
    const sentProgress = await sendPendingProgress(db, client, remainingBudget);
    remainingBudget = Math.max(0, remainingBudget - sentProgress);
    onProgress?.({ step: 'pending-study-materials', label: 'Sending queued study material edits', completed: 1, total: 2 });
    await sendPendingStudyMaterials(db, client, remainingBudget);
    onProgress?.({ step: 'complete', label: 'Pending progress synced', completed: 2, total: 2 });
  } catch (error) {
    await logSyncError(db, error, 'pending_sync').catch(() => {});
    throw wrapSyncError(error);
  }
}

async function runDownloadSync({ db, client, onProgress, onCheckpoint }: SyncOptions) {
  const report = (step: SyncStep, label: string, completed: number, total: number) => {
    onProgress?.({ step, label, completed, total });
  };

  const total = 7;
  let completed = 0;
  let currentStep: SyncStep = 'user';

  try {
    const cursors = await getSyncCursors(db);

    report('user', 'Refreshing user profile', completed, total);
    currentStep = 'user';
    const user = await client.getUser();
    await putUser(db, user);
    completed += 1;

    report('subjects', 'Downloading subjects', completed, total);
    currentStep = 'subjects';
    const subjects = await client.getSubjects(cursors.subjects, (page) => {
      report('subjects', formatDownloadLabel('subjects', page.loaded, page.total), completed, total);
    });
    report('subjects', `Saving subjects (${subjects.items.length})`, completed, total);
    await putSubjects(db, subjects.items, (saved, subjectTotal) => {
      report('subjects', formatSaveLabel('subjects', saved, subjectTotal), completed, total);
    });
    await setSyncCursor(db, 'subjects', subjects.dataUpdatedAt);
    await onCheckpoint?.();
    completed += 1;

    report('assignments', 'Downloading assignments', completed, total);
    currentStep = 'assignments';
    const assignments = await client.getAssignments(cursors.assignments, (page) => {
      report('assignments', formatDownloadLabel('assignments', page.loaded, page.total), completed, total);
    });
    report('assignments', `Saving assignments (${assignments.items.length})`, completed, total);
    await putAssignments(db, assignments.items, (saved, assignmentTotal) => {
      report('assignments', formatSaveLabel('assignments', saved, assignmentTotal), completed, total);
    });
    await setSyncCursor(db, 'assignments', assignments.dataUpdatedAt);
    await onCheckpoint?.();
    completed += 1;

    report('study-materials', 'Downloading study materials', completed, total);
    currentStep = 'study-materials';
    const studyMaterials = await client.getStudyMaterials(cursors.study_materials, (page) => {
      report('study-materials', formatDownloadLabel('study materials', page.loaded, page.total), completed, total);
    });
    report('study-materials', `Saving study materials (${studyMaterials.items.length})`, completed, total);
    await putStudyMaterials(db, studyMaterials.items, (saved, studyMaterialTotal) => {
      report('study-materials', formatSaveLabel('study materials', saved, studyMaterialTotal), completed, total);
    });
    await setSyncCursor(db, 'study_materials', studyMaterials.dataUpdatedAt);
    await onCheckpoint?.();
    completed += 1;

    report('level-progressions', 'Downloading level progressions', completed, total);
    currentStep = 'level-progressions';
    const levelProgressions = await client.getLevelProgressions(cursors.level_progressions, (page) => {
      report('level-progressions', formatDownloadLabel('level progressions', page.loaded, page.total), completed, total);
    });
    await putLevelProgressions(db, levelProgressions.items, (saved, levelTotal) => {
      report('level-progressions', formatSaveLabel('level progressions', saved, levelTotal), completed, total);
    });
    await setSyncCursor(db, 'level_progressions', levelProgressions.dataUpdatedAt);
    await onCheckpoint?.();
    completed += 1;

    report('voice-actors', 'Downloading voice actors', completed, total);
    currentStep = 'voice-actors';
    const voiceActors = await client.getVoiceActors(cursors.voice_actors, (page) => {
      report('voice-actors', formatDownloadLabel('voice actors', page.loaded, page.total), completed, total);
    });
    await putVoiceActors(db, voiceActors.items, (saved, voiceActorTotal) => {
      report('voice-actors', formatSaveLabel('voice actors', saved, voiceActorTotal), completed, total);
    });
    await setSyncCursor(db, 'voice_actors', voiceActors.dataUpdatedAt);
    await onCheckpoint?.();
    completed += 1;

    report('review-statistics', 'Downloading review statistics', completed, total);
    currentStep = 'review-statistics';
    const reviewStats = await client.getReviewStatistics(cursors.review_stats, (page) => {
      report('review-statistics', formatDownloadLabel('review statistics', page.loaded, page.total), completed, total);
    });
    report('review-statistics', `Saving review statistics (${reviewStats.items.length})`, completed, total);
    await putReviewStats(db, reviewStats.items, (saved, reviewStatTotal) => {
      report('review-statistics', formatSaveLabel('review statistics', saved, reviewStatTotal), completed, total);
    });
    await setSyncCursor(db, 'review_stats', reviewStats.dataUpdatedAt);
    await onCheckpoint?.();

    report('complete', 'Sync complete', total, total);
  } catch (error) {
    await logSyncError(db, error, `sync_step:${currentStep}`).catch(() => {});
    throw wrapSyncError(error);
  }
}

function formatDownloadLabel(label: string, loaded: number, total?: number) {
  return total ? `Downloading ${label} (${loaded}/${total})` : `Downloading ${label} (${loaded})`;
}

function formatSaveLabel(label: string, saved: number, total: number) {
  return `Saving ${label} (${saved}/${total})`;
}

function wrapSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const category = classifySyncError(error);
  const message = error instanceof Error ? error.message : String(error);
  return new SyncError(message, category, category !== 'auth');
}

export function isSyncAuthError(error: unknown): boolean {
  return error instanceof SyncError && error.category === 'auth';
}

export async function runFullRefresh(options: SyncOptions): Promise<void> {
  if (activeFullRefresh) {
    return activeFullRefresh;
  }

  if (activeSync) {
    await activeSync;
  }
  if (activeFullRefresh) {
    return activeFullRefresh;
  }

  let tracked: Promise<void>;
  tracked = (async () => {
    await runPendingOnly(options, 'standalone');
    await clearRemoteCache(options.db);
    await runDownloadSync(options);
  })().finally(() => {
    if (activeFullRefresh === tracked) {
      activeFullRefresh = null;
    }
    if (activeSync === tracked) {
      activeSync = null;
    }
  });

  activeFullRefresh = tracked;
  activeSync = tracked;
  return tracked;
}

async function sendPendingProgress(db: AppDatabase, client: WaniKaniClient, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  const rows = await db.getAllAsync<{ id: string; kind: string; payload: string }>(
    'SELECT id, kind, payload FROM pending_progress ORDER BY created_at ASC LIMIT ?',
    limit,
  );

  let sent = 0;
  for (const row of rows) {
    try {
      if (row.kind === 'lesson-start') {
        await client.startAssignment(JSON.parse(row.payload) as LessonStartPayload);
      } else if (row.kind === 'review') {
        await client.createReview(JSON.parse(row.payload) as ReviewProgressPayload);
      }
      await db.runAsync('DELETE FROM pending_progress WHERE id = ?', row.id);
      sent += 1;
    } catch (error) {
      if (error instanceof WaniKaniApiError && error.status === 422) {
        await logSyncError(db, error, `pending_progress: discarded stale ${row.kind}`).catch(() => {});
        await db.runAsync('DELETE FROM pending_progress WHERE id = ?', row.id);
        continue;
      }
      await db.runAsync(
        'UPDATE pending_progress SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        error instanceof Error ? error.message : String(error),
        row.id,
      );
      await logSyncError(db, error, `pending_progress: ${row.kind} send failed`).catch(() => {});
      throw error;
    }
  }
  return sent;
}

async function sendPendingStudyMaterials(db: AppDatabase, client: WaniKaniClient, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  const rows = await db.getAllAsync<{ id: string; subject_id: number }>(
    'SELECT id, subject_id FROM pending_study_materials ORDER BY created_at ASC LIMIT ?',
    limit,
  );

  let sent = 0;
  let remainingBudget = limit;
  for (const row of rows) {
    try {
      const local = await findBySubjectId(db, row.subject_id);
      if (!local) {
        await logSyncError(db, new Error(`Missing local study material for subject ${row.subject_id}`), 'pending_study_materials: orphan discarded').catch(() => {});
        await db.runAsync('DELETE FROM pending_study_materials WHERE id = ?', row.id);
        continue;
      }

      const requestCost = local.id > 0 ? 1 : 2;
      if (requestCost > remainingBudget) {
        break;
      }

      const parsed = JSON.parse(local.payload) as { data: Partial<StudyMaterialData> };
      const payload: StudyMaterialPayload = {
        subjectId: row.subject_id,
        meaningNote: parsed.data.meaning_note ?? '',
        readingNote: parsed.data.reading_note ?? '',
        meaningSynonyms: parsed.data.meaning_synonyms ?? [],
      };
      if (local.id > 0) {
        payload.id = local.id;
      }

      const resource = await client.upsertStudyMaterial(payload);
      await db.execAsync('BEGIN TRANSACTION;');
      try {
        if (resource) {
          await putStudyMaterialResource(db, resource);
        }
        await db.runAsync('DELETE FROM pending_study_materials WHERE id = ?', row.id);
        await db.execAsync('COMMIT;');
      } catch (error) {
        await db.execAsync('ROLLBACK;');
        throw error;
      }
      remainingBudget -= requestCost;
      sent += 1;
    } catch (error) {
      if (error instanceof WaniKaniApiError && error.status === 422) {
        await logSyncError(db, error, 'pending_study_materials: discarded stale').catch(() => {});
        await db.runAsync('DELETE FROM pending_study_materials WHERE id = ?', row.id);
        continue;
      }
      await db.runAsync(
        'UPDATE pending_study_materials SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        error instanceof Error ? error.message : String(error),
        row.id,
      );
      await logSyncError(db, error, 'pending_study_materials: send failed').catch(() => {});
      throw error;
    }
  }
  return sent;
}
