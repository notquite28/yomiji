# AGENTS.md — Yomichi (読み道, WaniKani React Native Study App)

## Commands

```bash
pnpm typecheck             # tsc --noEmit
pnpm test                  # jest --runInBand (single-threaded)
pnpm start                 # expo start (dev server)
pnpm android               # expo start --android
pnpm ios                   # expo start --ios
pnpm exec expo install --check # verify dependency versions match Expo SDK
```

Use `pnpm` for scripts and dependency changes; `pnpm-lock.yaml` is the lockfile to keep current. Always run `pnpm typecheck` after code changes. Run `pnpm test` if tests exist for the changed area.

## Project Structure

```
src/
  domain/           # Pure logic layer — no React, no UI imports
    answers/        # Answer checking, romaji-to-kana conversion
    api/            # WaniKani v2 REST client (WaniKaniClient.ts) + types
    db/             # SQLite open/migrations/put functions (database.ts, schema.ts)
    dashboard/      # Dashboard query aggregation
    settings/       # AppSettings, load/save via AsyncStorage
    storage/        # Secure token storage (expo-secure-store)
    study/          # Review/lesson queue queries, result queueing
    sync/           # Incremental sync + pending-write flush (syncService.ts)
  navigation/       # React Navigation routes, auth gate, AppState lifecycle
  screens/          # UI screens (Dashboard, Login, Settings, ReviewSession, LessonSession)
  theme/            # WaniKani color palette, subject-type colors, theme provider
App.tsx             # App root
tsurukame/          # Original iOS Swift/UIKit source — behavior reference only
```

Use `ROADMAP.md` for feature parity status and `tsurukame/REACT_NATIVE_PORT_PRD.md` for product requirements context.

## Key Constraints

- **`noUncheckedIndexedAccess`** is enabled. Array/tuple indexing returns `T | undefined`. Always guard with explicit undefined checks.
- **No `DOMException`** in React Native. Detect aborts with `error instanceof Error && error.name === 'AbortError'`.
- **Jest pinned to `~29.7.0`** — do not upgrade; Expo SDK 55 requires this version.
- **SQLite foreign keys enforced.** Child tables (assignments, study_materials, review_stats, audio_urls, subject_progress, pending_study_materials) reference `subjects(id)`. Delete children before parents in `resetLocalData`.
- Tests run in Node (`testEnvironment: 'node'`) — no React Native runtime. Only pure domain logic is testable without mocking.
- `ts-jest` preset, test files match `**/*.test.ts`.

## Architecture

- **Offline-first.** All study flows read from local SQLite. Network sync is incremental using `updated_after` cursors stored in `sync_cursors`.
- **Pending writes.** Review progress and lesson starts are written to `pending_progress` table first, then flushed to WaniKani API via `syncService.runPendingSync`.
- **Lifecycle sync.** `AppNavigator` uses `AppState` to: (1) run full sync on foreground if stale (>15 min), (2) flush pending writes on background only if pending writes exist.
- **In-app romaji-to-kana.** Reading prompts convert romaji input to kana via `kanaInput.ts` instead of forcing OS keyboard switch.
- **Image-only radicals.** Some radicals have no `characters` field, only `character_images`. The app stores empty string for `japanese`, includes `characterImageUrl` in answer data (PNG preferred), and renders images in the prompt UI.
- **Answer checker** ported from Tsurukame Swift: normalization, Levenshtein fuzzy matching, okurigana mismatch detection, invalid character ranges, other-reading detection, blacklists.

## Common Pitfalls

- **Study material sync** must skip entries whose `subject_id` is absent from local `subjects` table (hidden/uncached subjects). Do not abort the entire batch.
- **Radical `characters`** can be `null`. Store `characters ?? ''` — never use `slug` as fallback (it leaks the answer for meaning prompts).
- **`kana_vocabulary` subjects** are a distinct WaniKani API object but are stored/rendered as `vocabulary` in local subject-type flows. Handle both when comparing API `object` values or UI subject colors.
- **Subject colors** come from `colorForSubjectType()` in `src/theme/subjectColors.ts`; do not duplicate switch logic in screens.
- **Database singleton.** `openAppDatabase()` returns a cached promise. Call it; do not open a second connection.
- **Pending sync 422s** are treated as stale/invalid local writes and deleted from the queue. Preserve that behavior when extending pending-write sync.
- The `tsurukame/` directory is read-only reference code. Never import from it or modify it.
