# Repository Guidelines

## Project Overview

読路 (Yomiji) is a cross-platform WaniKani study client built with Expo React Native and TypeScript. It ports the learning semantics of the iOS app Tsurukame to Android/iOS, with an offline-first architecture using local SQLite as the primary data source.

## Architecture & Data Flow

**Layered architecture with strict boundaries:**

- **Domain layer** (`src/domain/`) — pure business logic, data access, API integration. No React/UI imports.
- **Presentation layer** (`src/screens/`, `src/components/`) — React components, theme-aware styling.
- **Infrastructure layer** (`src/navigation/`, `src/theme/`, `App.tsx`) — routing, auth gate, lifecycle hooks, theming.

**Data flow:**

1. Initial sync pulls WaniKani API data into SQLite via incremental `updated_after` cursors stored in `sync_cursors`.
2. All reads (dashboard, reviews, lessons, search, subject details) query the local database.
3. Writes (review results, lesson starts, study material edits) are queued in `pending_progress` and `pending_study_materials` tables before network submission.
4. Sync flushes pending writes before fetching remote updates. A singleton `activeSync` prevents concurrent syncs.
5. Lifecycle sync: foreground full sync when stale (>15 min), background flush only if pending writes exist. Pull-to-refresh is the explicit full-sync escape hatch.

**State management:** React hooks and local component state for transient UI and session state. Zustand for global stores: `useSettingsStore` (settings, persisted via AsyncStorage) and `useSyncStore` (sync progress/error/revision, ephemeral). Both stores defined in `src/domain/settings/settingsStore.ts` and `src/domain/sync/syncStore.ts`.

## Key Directories

| Directory | Purpose |
|---|---|
| `src/domain/api/` | WaniKani v2 REST client with rate limiting, pagination, typed errors |
| `src/domain/db/` | SQLite connection, schema/migrations, repository modules for subjects, assignments, study materials, review stats, error log |
| `src/domain/sync/` | Sync orchestration — incremental sync, pending-write flush, full refresh |
| `src/domain/study/` | Review/lesson queue queries, `ReviewSession` state machine, ordering strategies |
| `src/domain/answers/` | Answer checker, romaji-to-kana converter, feedback messages |
| `src/domain/dashboard/` | Dashboard aggregation queries (forecast, progress, leeches, mistakes) |
| `src/domain/settings/` | `AppSettings` type, defaults, AsyncStorage load/save |
| `src/domain/notifications/` | Notification scheduling (threshold + daily reminder), permissions |
| `src/domain/audio/` | Streaming vocabulary audio via expo-audio |
| `src/domain/subjects/` | Radical image repository, SVG CSS-variable processing |
| `src/domain/storage/` | Secure API token storage |
| `src/screens/` | All app screens (Dashboard, Login, Review/Lesson sessions, Subject browse/search/detail, Settings, Diagnostics) |
| `src/components/` | Shared UI components (`ScreenLayout`, `SessionHeader`, `SubjectHeroCard`, `SrsBar`, charts, `ReviewQuickSettings`, `ConfirmLeaveBanner`) |
| `src/navigation/` | React Navigation stack, auth gate, lifecycle sync hooks, route types |
| `src/theme/` | Theme provider (light/dark/system), WaniKani palette, `colorForSubjectType()` |
| `src/test/` | Test infrastructure — SQLite shim, test DB helpers, factories, mock API |
| `tsurukame/` | **Read-only** iOS Swift reference code. Never import from or modify. |
| `docs/` | Research docs (notifications, recommended lessons algorithm) |
| `scripts/` | `version-bump.sh` for release automation |
| `config-plugins/` | Custom Expo config plugins for AndroidManifest / build.gradle modifications |

## Development Commands

```bash
pnpm install                         # Install dependencies (pnpm only; pnpm-lock.yaml is authoritative)
pnpm start                           # expo start --dev-client
pnpm android                         # expo run:android
pnpm ios                             # expo run:ios
pnpm typecheck                       # tsc --noEmit
pnpm test                            # jest --runInBand
pnpm test -- path/to/file.test.ts    # focused test
pnpm version:bump [patch|minor|major] # bump version, commit, tag
```

- There is no lint or formatter script. Do not invent one.
- After code changes, run `pnpm typecheck`. Run `pnpm test -- <changed-area>.test.ts` when a matching test exists; otherwise `pnpm test` for domain changes.

## Code Conventions & Common Patterns

### TypeScript

- `strict` and `noUncheckedIndexedAccess` are enabled. Guard array/tuple indexing before use.
- React Native has no `DOMException`; detect aborts with `error instanceof Error && error.name === 'AbortError'`.

### Naming

- Repository files: `*Repository.ts` (e.g., `subjectRepository.ts`)
- Service files: `*Service.ts` (e.g., `syncService.ts`, `notificationService.ts`)
- Screen files: `*Screen.tsx` (e.g., `DashboardScreen.tsx`)
- Component files: `PascalCase.tsx` (e.g., `SubjectHeroCard.tsx`)
- Type files: `types.ts` per module
- Test files: `*.test.ts` (unit), `*.integration.test.ts` (integration with DB)

### Async & Error Handling

- Domain functions that touch the DB, API, or storage return Promises (`async`/`await`). Pure logic helpers (e.g., `checkAnswer`, `sortReviewQueue`) are synchronous.
- Custom error types with classification: `SyncError` (category), `WaniKaniApiError`.
- Sync errors logged to `error_log` table with sanitized messages (tokens redacted).
- Error classification: offline, timeout, auth (401/403), rate-limit (429), hibernating account, server.

### Database

- SQLite via `expo-sqlite`, no ORM. Raw SQL with `getAllAsync`/`runAsync`.
- `openAppDatabase()` returns a cached singleton connection.
- Foreign keys enforced. For cache resets, delete child tables before `subjects`: `assignments`, `study_materials`, `review_stats`, `audio_urls`, `subject_progress`, `pending_study_materials`.
- Full refresh clears remote data and cursors without dropping pending local writes.

### Styling

- All components use `makeStyles(theme: AppTheme)` pattern from `src/theme/AppThemeProvider.tsx`.
- Use `colorForSubjectType()` from `src/theme/subjectColors.ts` for subject-type colors — never duplicate the switch.

### Back Navigation & Confirmations

- **Do not use `Alert.alert` in session screens (Review, Lesson) for back-navigation confirmations.** It conflicts with predictive back gesture animations on Android. Use `ConfirmLeaveBanner` from `src/components/ConfirmLeaveBanner.tsx` instead — it renders an inline confirmation banner that is gesture-safe.
- Both `ReviewSessionScreen` and `LessonSessionScreen` already follow this pattern. The `handleBack` callback sets `confirmLeave` state; the `beforeRemove` listener stores `event.data.action` in a ref and sets `confirmLeave`. The banner calls either `navigation.dispatch(storedAction)` (gesture back) or `navigation.goBack()` (button back).

### Expo Config Plugins

- Expo SDK 55 does not yet have a native `predictiveBackGestureEnabled` config option (tracking [expo#38774](https://github.com/expo/expo/pull/38774)). The custom plugin `config-plugins/withPredictiveBackGesture.js` sets `android:enableOnBackInvokedCallback="true"` in AndroidManifest.xml.
- `npx expo prebuild --clean` regenerates `android/` and `ios/` from scratch. Any manual edits to generated files (like AndroidManifest.xml) **will be lost**. Always route Android manifest modifications through a config plugin.

### Dependency Injection

- Manual prop drilling from `AppNavigator` to screens (apiToken, db, callbacks).
- Database passed as parameter where needed, not imported as global singleton from call sites.

## Important Files

| File | Role |
|---|---|
| `App.tsx` | Entry point — NavigationContainer, theme, notification tap handler |
| `src/navigation/AppNavigator.tsx` | Auth gate, sync lifecycle (15min full sync, 1min pending flush), screen routing |
| `src/domain/db/database.ts` | DB singleton, migrations, high-level CRUD (`put*` functions) |
| `src/domain/db/schema.ts` | Schema definitions and migrations array |
| `src/domain/study/reviewSession.ts` | In-memory review state machine (two-queue, ordering, wrap-up) |
| `src/domain/answers/answerChecker.ts` | Answer validation with normalization, kana, fuzzy matching |
| `src/domain/settings/settings.ts` | `AppSettings` type, defaults, load/save |
| `src/domain/api/WaniKaniClient.ts` | API client with rate limiting and pagination |
| `src/test/factories.ts` | Test data factories (`makeRadical`, `makeKanji`, `makeAssignment`, etc.) |
| `src/test/mockApi.ts` | Mock WaniKani client with call tracking |
| `src/test/testDb.ts` | `createTestDatabase()` helper for integration tests |
| `ROADMAP.md` | Milestone tracking — source of truth for implementation status |
| `REACT_NATIVE_PORT_PRD.md` | Product requirements document |
| `config-plugins/withPredictiveBackGesture.js` | Expo config plugin: enables Android predictive back gesture (Android 13+) |

## Runtime & Tooling

- **Runtime:** Node.js 22 (CI), React Native 0.83.6 with Hermes engine
- **Package manager:** pnpm 9 — never use npm or yarn
- **Framework:** Expo SDK 55 (managed workflow with dev client)
- **TypeScript:** 5.9.3, strict mode, `noUncheckedIndexedAccess`
- **Jest:** ~29.7.0 with `ts-jest` — Expo SDK 55 depends on this range
- **No ESLint/Prettier configured** — do not add one
- **EAS CLI** >=15.0.0 for builds

## Testing & QA

### Test Structure

Tests run in Node via `ts-jest`. React Native APIs need mocking or should stay out of unit-tested domain code.

- **Unit tests:** Pure function logic, no database — `answerChecker.test.ts`, `kanaInput.test.ts`, `radicalSvg.test.ts`, `reviewSession.test.ts`, `studyRepository.test.ts`, `errorLog.test.ts`, `dashboardRepository.test.ts`
- **Integration tests:** Real database via `createTestDatabase()` — `dataIntegrity.integration.test.ts`, `syncService.integration.test.ts`, `errorHandling.integration.test.ts`, `pendingWrites.integration.test.ts`, `notificationService.test.ts`

### Test Infrastructure

- `src/test/sqliteShim.ts` — wraps `better-sqlite3` to provide the `expo-sqlite` async interface for Node
- `src/test/testDb.ts` — `createTestDatabase()` creates in-memory DB with migrations applied; returns `{ db, cleanup }`
- `src/test/factories.ts` — `makeUser`, `makeRadical`, `makeKanji`, `makeVocabulary`, `makeAssignment`, `makeStudyMaterial`, `makeReviewStat`, `makeLevelProgression`, `makeVoiceActor`, `makeCollectionResponse`; uses `nextTestId()` / `resetIdCounter()`
- `src/test/mockApi.ts` — `createMockApi()` returns `MockApiClient` with Jest-mocked API methods, `getCalls()` for inspection, `reset()` for cleanup
- `src/test/__mocks__/expo-sqlite.ts` — no-op mock so domain modules can import without error

### Patterns

- Standard `describe/it` blocks. Local helpers per test file (e.g., `makeSubject()`, `setupDb()`).
- `jest.mock()` at module level for external deps. Real exports kept where possible.
- Async throughout — all DB/API tests use `await`.
- Assertions: `countRows(db, table)`, `getAllRows(db, table)`, `mockApi.getCalls('method')`.

## WaniKani Data Gotchas

- Radical `characters` can be `null`; always render as `characters ?? ''`. Never fall back to `slug` (leaks the answer).
- Image-only radicals use `character_images`; prefer PNG, with SVG CSS fallback via `src/domain/subjects/radicalSvg.ts`.
- API `kana_vocabulary` objects are stored/rendered as local `vocabulary` — account for both names in API payloads.
- Study material sync must skip entries whose `subject_id` is absent locally rather than aborting the batch.
- Pending sync 422 responses indicate stale/invalid local writes — delete with diagnostics.

## Android Release Signing

- GitHub release APKs are signed from CI secrets: `YOMIJI_KEYSTORE_BASE64`, `YOMIJI_KEYSTORE_PASSWORD`. `KEY_ALIAS` is `yomiji`.
- The release workflow decodes the keystore, passes an absolute `KEYSTORE_FILE`, verifies the `yomiji` alias before building, and verifies the final APK signature with `apksigner`.
- Gradle reads `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` env vars. Release builds fail closed if signing material is missing or invalid; they must not fall back to debug signing.
- Debug builds still use `android/app/debug.keystore` for local development.
- **Do not lose the release keystore** — without it, the app cannot be updated under the same package name.

## Versioning & Releases

- Semver. Pre-1.0: patch for bug fixes, minor for features, major for milestones.
- Do not bump on every commit. Bump only when the user asks or changes warrant it.
- `pnpm version:bump [patch|minor|major]` updates `package.json`, `app.json` (version + versionCode), commits, and tags.
- CI (`.github/workflows/android-release.yml`) triggers on `v*` tags — regular pushes do not create releases.
- After bump: `git push --follow-tags origin main`.

## Current Product Gaps

- Offline audio download/caching, custom fonts, font-size settings
- Deep links and universal/app links
- WaniKani recommended lessons vs. advanced lesson pool separation (research in `docs/recommended-lessons-research.md`, blocked on webapp data)
- Device QA checklists and large-cache performance tests
