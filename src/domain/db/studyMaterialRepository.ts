import { StudyMaterialPayload } from '../api/types';
import { AppDatabase } from './database';

export async function findBySubjectId(db: AppDatabase, subjectId: number): Promise<{ id: number; payload: string } | null> {
  return db.getFirstAsync<{ id: number; payload: string }>(
    'SELECT id, payload FROM study_materials WHERE subject_id = ?',
    subjectId,
  );
}

export async function upsertWithSynonyms(db: AppDatabase, payload: StudyMaterialPayload): Promise<void> {
  const existing = await findBySubjectId(db, payload.subjectId);

  if (existing) {
    const parsed = JSON.parse(existing.payload) as { data: Record<string, unknown> };
    if (payload.meaningSynonyms !== undefined) {
      parsed.data.meaning_synonyms = payload.meaningSynonyms;
    }
    await db.runAsync(
      'UPDATE study_materials SET payload = ? WHERE id = ?',
      JSON.stringify(parsed),
      existing.id,
    );
  } else {
    const localId = -payload.subjectId;
    const createdAt = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO study_materials (id, subject_id, payload, updated_at)
       VALUES (?, ?, ?, ?)`,
      localId,
      payload.subjectId,
      JSON.stringify({
        id: localId,
        object: 'study_material',
        data: {
          subject_id: payload.subjectId,
          meaning_synonyms: payload.meaningSynonyms ?? [],
          meaning_note: payload.meaningNote ?? '',
          reading_note: payload.readingNote ?? '',
        },
      }),
      createdAt,
    );
  }
}
