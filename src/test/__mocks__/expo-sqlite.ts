/**
 * Mock for expo-sqlite in Node test environment.
 *
 * Replaces the native module with our better-sqlite3 shim.
 * The database.ts module calls `openDatabaseAsync` and uses the returned
 * SQLiteDatabase, but integration tests call `createTestDb()` directly
 * and pass the db instance. This mock is needed so that importing
 * database.ts doesn't fail at module load time.
 */

// The integration tests use createTestDb() directly and never call openDatabaseAsync.
// This mock exists solely to prevent the `import * as SQLite from 'expo-sqlite'`
// in database.ts from failing during Jest module resolution.

export function openDatabaseAsync(_name: string) {
  throw new Error(
    'openDatabaseAsync should not be called in tests. ' +
    'Use createTestDb() from src/test/sqliteShim.ts instead.',
  );
}
