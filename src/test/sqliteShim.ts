/**
 * SQLite shim for Node.js integration tests.
 *
 * Wraps `better-sqlite3` to expose the same async interface as `expo-sqlite`'s `SQLiteDatabase`.
 * This allows integration tests to run against a real in-memory SQLite database
 * without importing React Native runtime code.
 */
import BetterSqlite3 from 'better-sqlite3';
import type { AppDatabase } from '../domain/db/database';

export type SQLiteBindValue = string | number | boolean | null | ArrayBuffer;

/**
 * Create an in-memory SQLite database that implements the expo-sqlite
 * `SQLiteDatabase` async interface used by the app.
 */
export function createTestDb(): AppDatabase {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return {
    execAsync(source: string): Promise<void> {
      // Extract and apply PRAGMA statements via db.pragma() for reliable
      // enforcement across all SQLite builds, then exec the rest.
      const lines = source.split('\n');
      const pragmas: string[] = [];
      const rest: string[] = [];
      for (const line of lines) {
        if (/^\s*PRAGMA\s+/i.test(line)) {
          pragmas.push(line.replace(/^\s*PRAGMA\s+/i, '').replace(/;\s*$/, ''));
        } else {
          rest.push(line);
        }
      }
      for (const p of pragmas) {
        db.pragma(p);
      }
      const remaining = rest.join('\n').trim();
      if (remaining) {
        db.exec(remaining);
      }
      return Promise.resolve();
    },

    runAsync(source: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }> {
      const stmt = db.prepare(source);
      const result = stmt.run(...normalizeParams(params));
      return Promise.resolve({ lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes });
    },

    getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
      const stmt = db.prepare(source);
      const row = stmt.get(...normalizeParams(params)) as T | undefined;
      return Promise.resolve(row ?? null);
    },

    getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
      const stmt = db.prepare(source);
      const rows = stmt.all(...normalizeParams(params)) as T[];
      return Promise.resolve(rows);
    },

    closeAsync(): Promise<void> {
      db.close();
      return Promise.resolve();
    },

    withTransactionAsync(task: () => Promise<void>): Promise<void> {
      return new Promise((resolve, reject) => {
        db.exec('BEGIN TRANSACTION;');
        task()
          .then(() => {
            db.exec('COMMIT;');
            resolve();
          })
          .catch((error: unknown) => {
            db.exec('ROLLBACK;');
            reject(error);
          });
      });
    },
  } as unknown as AppDatabase;
}

/**
 * Normalize variadic params to an array for better-sqlite3.
 * The expo-sqlite API accepts either variadic args or a single array/object param.
 */
function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 0) return [];
  // If the first param is an array, use it directly
  if (Array.isArray(params[0])) return params[0] as unknown[];
  // If it's a plain object (not null/ArrayBuffer), treat as named params
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !(params[0] instanceof ArrayBuffer)) {
    return [params[0]];
  }
  return params;
}
