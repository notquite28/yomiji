import * as SQLite from 'expo-sqlite';

import {
  ApiResource,
  AssignmentData,
  LevelProgressionData,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectData,
  VoiceActorData,
  WaniKaniUserData,
} from '../api/types';
import { migrations } from './schema';

export type AppDatabase = SQLite.SQLiteDatabase;
type SaveProgressCallback = (saved: number, total: number) => void;

let databasePromise: Promise<AppDatabase> | null = null;

export async function openAppDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('tsurukame-rn.db').then(async (db) => {
      await applyMigrations(db);
      return db;
    });
  }

  return databasePromise;
}

export async function applyMigrations(db: AppDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    await db.execAsync('BEGIN TRANSACTION;');
    try {
      await db.execAsync(migration.sql);
      await db.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', migration.version, new Date().toISOString());
      await db.execAsync('COMMIT;');
    } catch (error) {
      await db.execAsync('ROLLBACK;');
      throw error;
    }
  }
}

export async function getSyncCursors(db: AppDatabase) {
  const rows = await db.getAllAsync<{ collection: string; updated_after: string }>('SELECT collection, updated_after FROM sync_cursors');
  return Object.fromEntries(rows.map((row) => [row.collection, row.updated_after]));
}

export async function getLastSyncTime(db: AppDatabase) {
  const row = await db.getFirstAsync<{ synced_at: string | null }>('SELECT MAX(synced_at) AS synced_at FROM sync_cursors');
  return row?.synced_at ? Date.parse(row.synced_at) : 0;
}

export async function setSyncCursor(db: AppDatabase, collection: string, updatedAfter: string) {
  if (!updatedAfter) {
    return;
  }

  await db.runAsync(
    `INSERT INTO sync_cursors (collection, updated_after, synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(collection) DO UPDATE SET updated_after = excluded.updated_after, synced_at = excluded.synced_at`,
    collection,
    updatedAfter,
    new Date().toISOString(),
  );
}

export async function putUser(db: AppDatabase, user: ApiResource<WaniKaniUserData>) {
  await db.runAsync(
    `INSERT INTO user (id, username, level, vacation_started_at, payload, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       level = excluded.level,
       vacation_started_at = excluded.vacation_started_at,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    user.data.username,
    user.data.level,
    user.data.current_vacation_started_at ?? null,
    JSON.stringify(user),
    user.data_updated_at ?? new Date().toISOString(),
  );
}

export async function putSubjects(db: AppDatabase, subjects: Array<ApiResource<SubjectData>>, onProgress?: SaveProgressCallback) {
  let saved = 0;
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const subject of subjects) {
      if (!subject.id) {
        saved += 1;
        reportSaveProgress(saved, subjects.length, onProgress);
        continue;
      }

      const subjectType = subject.object === 'kana_vocabulary' ? 'vocabulary' : subject.object;
      await db.runAsync(
        `INSERT INTO subjects (id, japanese, level, subject_type, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           japanese = excluded.japanese,
           level = excluded.level,
           subject_type = excluded.subject_type,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        subject.id,
        subject.data.characters ?? '',
        subject.data.level,
        subjectType,
        JSON.stringify(subject),
        subject.data_updated_at ?? null,
      );

      await putSubjectAudioUrls(db, subject);
      saved += 1;
      reportSaveProgress(saved, subjects.length, onProgress);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function putAssignments(db: AppDatabase, assignments: Array<ApiResource<AssignmentData>>, onProgress?: SaveProgressCallback) {
  const subjects = await db.getAllAsync<{ id: number; level: number; subject_type: string }>('SELECT id, level, subject_type FROM subjects');
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  let saved = 0;

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const assignment of assignments) {
      if (!assignment.id) {
        saved += 1;
        reportSaveProgress(saved, assignments.length, onProgress);
        continue;
      }

      const subject = subjectById.get(assignment.data.subject_id);
      const subjectType = assignment.data.subject_type === 'kana_vocabulary' ? 'vocabulary' : assignment.data.subject_type;

      await db.runAsync(
        `INSERT INTO assignments (id, subject_id, level, subject_type, srs_stage, available_at, started_at, passed_at, burned_at, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           subject_id = excluded.subject_id,
           level = excluded.level,
           subject_type = excluded.subject_type,
           srs_stage = excluded.srs_stage,
           available_at = excluded.available_at,
           started_at = excluded.started_at,
           passed_at = excluded.passed_at,
           burned_at = excluded.burned_at,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        assignment.id,
        assignment.data.subject_id,
        subject?.level ?? null,
        subjectType || subject?.subject_type || 'unknown',
        assignment.data.srs_stage,
        assignment.data.available_at ?? null,
        assignment.data.started_at ?? null,
        assignment.data.passed_at ?? null,
        assignment.data.burned_at ?? null,
        JSON.stringify(assignment),
        assignment.data_updated_at ?? null,
      );
      saved += 1;
      reportSaveProgress(saved, assignments.length, onProgress);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function putStudyMaterials(db: AppDatabase, studyMaterials: Array<ApiResource<StudyMaterialData>>, onProgress?: SaveProgressCallback) {
  const subjectRows = await db.getAllAsync<{ id: number }>('SELECT id FROM subjects');
  const subjectIds = new Set(subjectRows.map((subject) => subject.id));
  let saved = 0;
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const studyMaterial of studyMaterials) {
      if (!studyMaterial.id || !subjectIds.has(studyMaterial.data.subject_id)) {
        saved += 1;
        reportSaveProgress(saved, studyMaterials.length, onProgress);
        continue;
      }

      await db.runAsync(
        `INSERT INTO study_materials (id, subject_id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           subject_id = excluded.subject_id,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        studyMaterial.id,
        studyMaterial.data.subject_id,
        JSON.stringify(studyMaterial),
        studyMaterial.data_updated_at ?? null,
      );
      saved += 1;
      reportSaveProgress(saved, studyMaterials.length, onProgress);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function putLevelProgressions(db: AppDatabase, levels: Array<ApiResource<LevelProgressionData>>, onProgress?: SaveProgressCallback) {
  await putSimpleCollection(db, 'level_progressions', levels, (level) => [level.data.level, JSON.stringify(level), level.data_updated_at ?? null], onProgress);
}

export async function putVoiceActors(db: AppDatabase, voiceActors: Array<ApiResource<VoiceActorData>>, onProgress?: SaveProgressCallback) {
  await putSimpleCollection(db, 'voice_actors', voiceActors, (voiceActor) => [voiceActor.data.name, JSON.stringify(voiceActor), voiceActor.data_updated_at ?? null], onProgress);
}

export async function putReviewStats(db: AppDatabase, stats: Array<ApiResource<ReviewStatisticData>>, onProgress?: SaveProgressCallback) {
  let saved = 0;
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const stat of stats) {
      if (!stat.id) {
        saved += 1;
        reportSaveProgress(saved, stats.length, onProgress);
        continue;
      }
      await db.runAsync(
        `INSERT INTO review_stats (id, subject_id, subject_type, percentage_correct, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           subject_id = excluded.subject_id,
           subject_type = excluded.subject_type,
           percentage_correct = excluded.percentage_correct,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        stat.id,
        stat.data.subject_id,
        stat.data.subject_type ?? null,
        stat.data.percentage_correct ?? null,
        JSON.stringify(stat),
        stat.data_updated_at ?? null,
      );
      saved += 1;
      reportSaveProgress(saved, stats.length, onProgress);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function resetLocalData(db: AppDatabase) {
  const tables = [
    'sync_cursors',
    'assignments',
    'study_materials',
    'level_progressions',
    'voice_actors',
    'review_stats',
    'audio_urls',
    'subject_progress',
    'pending_progress',
    'pending_study_materials',
    'error_log',
    'subjects',
    'user',
  ];

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const table of tables) {
      await db.execAsync(`DELETE FROM ${table};`);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

async function putSubjectAudioUrls(db: AppDatabase, subject: ApiResource<SubjectData>) {
  if (!subject.id || !subject.data.pronunciation_audios?.length) {
    return;
  }

  for (const audio of subject.data.pronunciation_audios) {
    await db.runAsync(
      `INSERT INTO audio_urls (subject_id, voice_actor_id, remote_url, status)
       VALUES (?, ?, ?, 'remote')
       ON CONFLICT(subject_id, remote_url) DO UPDATE SET
         voice_actor_id = excluded.voice_actor_id`,
      subject.id,
      audio.metadata?.voice_actor_id ?? null,
      audio.url,
    );
  }
}

async function putSimpleCollection<TData>(
  db: AppDatabase,
  table: 'level_progressions' | 'voice_actors',
  items: Array<ApiResource<TData>>,
  values: (item: ApiResource<TData>) => SQLite.SQLiteBindValue[],
  onProgress?: SaveProgressCallback,
) {
  const columns = table === 'level_progressions' ? '(id, level, payload, updated_at)' : '(id, name, payload, updated_at)';
  const updates = table === 'level_progressions'
    ? 'level = excluded.level, payload = excluded.payload, updated_at = excluded.updated_at'
    : 'name = excluded.name, payload = excluded.payload, updated_at = excluded.updated_at';

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    let saved = 0;
    for (const item of items) {
      if (!item.id) {
        saved += 1;
        reportSaveProgress(saved, items.length, onProgress);
        continue;
      }
      await db.runAsync(
        `INSERT INTO ${table} ${columns}
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ${updates}`,
        item.id,
        ...values(item),
      );
      saved += 1;
      reportSaveProgress(saved, items.length, onProgress);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

function reportSaveProgress(saved: number, total: number, onProgress?: SaveProgressCallback) {
  if (!onProgress || total === 0) {
    return;
  }
  if (saved === total || saved % 250 === 0) {
    onProgress(saved, total);
  }
}
