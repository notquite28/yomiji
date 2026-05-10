import { WaniKaniApiError, WaniKaniClient } from '../api/WaniKaniClient';
import { LessonStartPayload, ReviewProgressPayload, StudyMaterialPayload } from '../api/types';
import {
  AppDatabase,
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
let activePendingSync: Promise<void> | null = null;

export function runIncrementalSync(options: SyncOptions) {
  if (activeSync) {
    return activeSync;
  }

  activeSync = runSync(options).finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export function runPendingSync(options: SyncOptions) {
  if (activeSync) {
    return activeSync;
  }
  if (activePendingSync) {
    return activePendingSync;
  }

  activePendingSync = runPendingOnlySync(options).finally(() => {
    activePendingSync = null;
  });

  return activePendingSync;
}

export async function hasPendingWrites(db: AppDatabase) {
  const row = await db.getFirstAsync<{ value: number }>(
    `SELECT
       (SELECT COUNT(*) FROM pending_progress) +
       (SELECT COUNT(*) FROM pending_study_materials) AS value`,
  );
  return (row?.value ?? 0) > 0;
}

async function runPendingOnlySync({ db, client, onProgress }: SyncOptions) {
  if (!(await hasPendingWrites(db))) {
    return;
  }

  onProgress?.({ step: 'pending-progress', label: 'Sending queued lesson and review progress', completed: 0, total: 2 });
  await sendPendingProgress(db, client);
  onProgress?.({ step: 'pending-study-materials', label: 'Sending queued study material edits', completed: 1, total: 2 });
  await sendPendingStudyMaterials(db, client);
  onProgress?.({ step: 'complete', label: 'Pending progress synced', completed: 2, total: 2 });
}

async function runSync({ db, client, onProgress, onCheckpoint }: SyncOptions) {
  const report = (step: SyncStep, label: string, completed: number, total: number) => {
    onProgress?.({ step, label, completed, total });
  };

  const total = 9;
  let completed = 0;

  report('pending-progress', 'Sending queued lesson and review progress', completed, total);
  await sendPendingProgress(db, client);
  completed += 1;

  report('pending-study-materials', 'Sending queued study material edits', completed, total);
  await sendPendingStudyMaterials(db, client);
  completed += 1;

  const cursors = await getSyncCursors(db);

  report('user', 'Refreshing user profile', completed, total);
  const user = await client.getUser();
  await putUser(db, user);
  completed += 1;

  report('subjects', 'Downloading subjects', completed, total);
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
}

function formatDownloadLabel(label: string, loaded: number, total?: number) {
  return total ? `Downloading ${label} (${loaded}/${total})` : `Downloading ${label} (${loaded})`;
}

function formatSaveLabel(label: string, saved: number, total: number) {
  return `Saving ${label} (${saved}/${total})`;
}

async function sendPendingProgress(db: AppDatabase, client: WaniKaniClient) {
  const rows = await db.getAllAsync<{ id: string; kind: string; payload: string }>(
    'SELECT id, kind, payload FROM pending_progress ORDER BY created_at ASC',
  );

  for (const row of rows) {
    try {
      if (row.kind === 'lesson-start') {
        await client.startAssignment(JSON.parse(row.payload) as LessonStartPayload);
      } else if (row.kind === 'review') {
        await client.createReview(JSON.parse(row.payload) as ReviewProgressPayload);
      }
      await db.runAsync('DELETE FROM pending_progress WHERE id = ?', row.id);
    } catch (error) {
      if (error instanceof WaniKaniApiError && error.status === 422) {
        await db.runAsync('DELETE FROM pending_progress WHERE id = ?', row.id);
        continue;
      }
      await db.runAsync(
        'UPDATE pending_progress SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        error instanceof Error ? error.message : String(error),
        row.id,
      );
      throw error;
    }
  }
}

async function sendPendingStudyMaterials(db: AppDatabase, client: WaniKaniClient) {
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    'SELECT id, payload FROM pending_study_materials ORDER BY created_at ASC',
  );

  for (const row of rows) {
    try {
      await client.upsertStudyMaterial(JSON.parse(row.payload) as StudyMaterialPayload);
      await db.runAsync('DELETE FROM pending_study_materials WHERE id = ?', row.id);
    } catch (error) {
      if (error instanceof WaniKaniApiError && error.status === 422) {
        await db.runAsync('DELETE FROM pending_study_materials WHERE id = ?', row.id);
        continue;
      }
      await db.runAsync(
        'UPDATE pending_study_materials SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        error instanceof Error ? error.message : String(error),
        row.id,
      );
      throw error;
    }
  }
}
