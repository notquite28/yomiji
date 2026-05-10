# AGENTS.md — Yomichi (読み道, WaniKani React Native Study App)

## Commands

```bash
npm run typecheck          # tsc --noEmit
npm test                   # jest --runInBand (single-threaded)
npm start                  # expo start (dev server)
npm run android            # expo start --android
npx expo install --check   # verify dependency versions match Expo SDK
```

Always run `npm run typecheck` after code changes. Run `npm test` if tests exist for the changed area.

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

## Key Constraints

- **`noUncheckedIndexedAccess`** is enabled. Array/tuple indexing returns `T | undefined`. Always guard with explicit undefined checks.
- **No `DOMException`** in React Native. Detect aborts with `error instanceof Error && error.name === 'AbortError'`.
- **Jest pinned to `~29.7.0`** — do not upgrade; Expo SDK 55 requires this version.
- **SQLite foreign keys enforced.** Child tables (assignments, study_materials, review_stats, audio_urls, subject_progress) reference `subjects(id)`. Delete children before parents in `resetLocalData`.
- Tests run in Node (`testEnvironment: 'node'`) — no React Native runtime. Only pure domain logic is testable without mocking.
- `ts-jest` preset, test files match `**/*.test.ts`.

## Architecture

- **Offline-first.** All study flows read from local SQLite. Network sync is incremental using `updated_after` cursors stored in `sync_cursors`.
- **Pending writes.** Review progress and lesson starts are written to `pending_progress` table first, then flushed to WaniKani API via `syncService.runPendingSync`.
- **Lifecycle sync.** `AppNavigator` uses `AppState` to: (1) run full sync on foreground if stale (>15 min), (2) flush pending writes on background only if pending writes exist.
- **In-app romaji-to-kana.** Reading prompts convert romaji input to kana via `kanaInput.ts` instead of forcing OS keyboard switch.
- **Image-only radicals.** Some radicals have no `characters` field, only `character_images`. The app stores empty string for `japanese`, includes `characterImageUrl` in answer data (PNG preferred), and renders images in the prompt UI.
- **Answer checker** ported from Tsurukame Swift: normalization, Levenshtein fuzzy matching, okurigana mismatch detection, invalid character ranges, other-reading detection, blacklists.

## WaniKani Subject Colors

- Radical: `#00aaff` (blue)
- Kanji: `#ff00aa` (pink)
- Vocabulary: `#aa00ff` (purple)

Use `colorForSubjectType()` from `src/theme/subjectColors.ts`.

## Common Pitfalls

- **Study material sync** must skip entries whose `subject_id` is absent from local `subjects` table (hidden/uncached subjects). Do not abort the entire batch.
- **Radical `characters`** can be `null`. Store `characters ?? ''` — never use `slug` as fallback (it leaks the answer for meaning prompts).
- **Database singleton.** `openAppDatabase()` returns a cached promise. Call it; do not open a second connection.
- The `tsurukame/` directory is read-only reference code. Never import from it or modify it.
