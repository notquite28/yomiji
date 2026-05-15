/**
 * Test database helpers for integration tests.
 *
 * Creates an in-memory SQLite database via the shim and applies migrations,
 * matching the exact state the production app starts with.
 */
import { applyMigrations } from '../domain/db/database';
import { createTestDb } from './sqliteShim';
import type { AppDatabase } from '../domain/db/database';

/**
 * Create an in-memory test database with all migrations applied.
 * Returns the db instance and a cleanup function.
 */
export async function createTestDatabase(): Promise<{ db: AppDatabase; cleanup: () => Promise<void> }> {
  const db = createTestDb();
  await applyMigrations(db);
  return {
    db,
    cleanup: async () => {
      await db.closeAsync();
    },
  };
}

/**
 * Count rows in a table.
 */
export async function countRows(db: AppDatabase, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

/**
 * Get all rows from a table (for assertions). Use sparingly — prefer countRows.
 */
export async function getAllRows<T>(db: AppDatabase, table: string): Promise<T[]> {
  return db.getAllAsync<T>(`SELECT * FROM ${table}`);
}
