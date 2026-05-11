import { WaniKaniApiError } from '../api/WaniKaniClient';
import { AppDatabase } from './database';

export type ErrorLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ErrorLogEntry = {
  id: number;
  level: string;
  message: string;
  context: string | null;
  created_at: string;
};

export type SyncErrorCategory = 'offline' | 'timeout' | 'auth' | 'rate-limit' | 'server' | 'unknown';

export type SyncErrorInfo = {
  category: SyncErrorCategory;
  message: string;
  isRetryable: boolean;
};

const TOKEN_PATTERN = /Token token=[a-f0-9\-]{8,}/gi;
const URL_TOKEN_PATTERN = /([?&]api_key=)[^&\s]+/gi;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 2000;

export function describeSyncError(error: unknown): SyncErrorInfo {
  const category = classifySyncError(error);
  const raw = error instanceof Error ? error.message : String(error);
  switch (category) {
    case 'offline':
      return { category, message: 'No internet connection. Check your network and try again.', isRetryable: true };
    case 'timeout':
      return { category, message: 'Request timed out. Try again later.', isRetryable: true };
    case 'auth':
      return { category, message: 'Session expired or token invalid. Please log in again.', isRetryable: false };
    case 'rate-limit':
      return { category, message: 'Too many requests. Wait a moment and try again.', isRetryable: true };
    case 'server':
      return { category, message: 'WaniKani server error. Try again later.', isRetryable: true };
    default:
      return { category, message: sanitize(raw), isRetryable: true };
  }
}

export function sanitize(text: string): string {
  let result = text.replace(TOKEN_PATTERN, 'Token token=[REDACTED]');
  result = result.replace(URL_TOKEN_PATTERN, '$1[REDACTED]');
  return result.slice(0, MAX_MESSAGE_LENGTH);
}

export function classifySyncError(error: unknown): SyncErrorCategory {
  if (error instanceof WaniKaniApiError) {
    if (error.status === 0) return 'timeout';
    if (error.status === 401 || error.status === 403) return 'auth';
    if (error.status === 429) return 'rate-limit';
    if (error.status >= 500) return 'server';
    return 'unknown';
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('network request failed') ||
      msg.includes('offline') ||
      msg.includes('no connection') ||
      msg.includes('connect') ||
      msg.includes('dns') ||
      msg.includes('host unreachable')
    ) {
      return 'offline';
    }
  }

  return 'unknown';
}

export async function logError(db: AppDatabase, level: ErrorLogLevel, message: string, context?: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO error_log (level, message, context, created_at) VALUES (?, ?, ?, ?)',
    level,
    sanitize(message).slice(0, MAX_MESSAGE_LENGTH),
    context ? sanitize(context).slice(0, MAX_CONTEXT_LENGTH) : null,
    new Date().toISOString(),
  );
}

export async function logSyncError(db: AppDatabase, error: unknown, context: string): Promise<void> {
  const category = classifySyncError(error);
  const message = error instanceof Error ? error.message : String(error);
  const level: ErrorLogLevel = category === 'auth' ? 'error' : 'warn';
  const enrichedContext = `${context} [${category}]`;

  await logError(db, level, message, enrichedContext);
}

export async function getErrorLogEntries(db: AppDatabase, limit = 100, offset = 0): Promise<ErrorLogEntry[]> {
  return db.getAllAsync<ErrorLogEntry>(
    'SELECT * FROM error_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
    limit,
    offset,
  );
}

export async function getErrorLogCount(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM error_log');
  return row?.count ?? 0;
}

export async function pruneErrorLog(db: AppDatabase, maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const result = await db.runAsync('DELETE FROM error_log WHERE created_at < ?', cutoff);
  return result.changes;
}

export async function clearErrorLog(db: AppDatabase): Promise<void> {
  await db.execAsync('DELETE FROM error_log');
}
