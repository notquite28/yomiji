# Repository Guidelines

## Project shape

- 読路 (Yomiji) is an Expo React Native + TypeScript WaniKani client. It is offline-first: SQLite is the primary read source, with WaniKani API sync filling/updating local tables.
- Keep layer boundaries strict: `src/domain/` is pure business/data/API logic and must not import React/UI; `src/screens/` and `src/components/` are presentation; `src/navigation/`, `src/theme/`, and `App.tsx` wire app lifecycle/routing/theme.
- `tsurukame/` is a read-only Swift reference. Use it for behavior comparison only; never import from it or modify it.

## Commands

```bash
pnpm install                         # pnpm only; pnpm-lock.yaml is authoritative
pnpm start                           # expo start --dev-client
pnpm start -- --clear                # clear Metro cache when UI changes look stale
pnpm android                         # expo run:android; creates/runs a dev build
pnpm ios                             # expo run:ios
pnpm web                             # expo start --web; experimental/unsupported
pnpm typecheck                       # tsc --noEmit
pnpm test                            # jest --runInBand
pnpm test -- src/path/file.test.ts   # focused Jest test
pnpm version:bump [patch|minor|major] # bumps package/app/native versions, commits, tags
pnpm exec expo install --check       # dependency compatibility check
```

- There is no lint/formatter script; do not invent one.
- After code changes, run `pnpm typecheck`. For domain changes, run the matching `*.test.ts` when available; otherwise run `pnpm test`.
- Jest `testMatch` is `**/*.test.ts` (not `.tsx`). Write component/screen tests as `.test.ts` even when the source is `.tsx`.
- JS-only UI edits should not require a native rebuild, but stale dev-client output often needs `pnpm start -- --clear` plus app reload. Native/config changes need `pnpm android`/`pnpm ios`; `npx expo prebuild --clean` regenerates native dirs.

## Runtime/tooling facts

- Node 22, pnpm 9+, Expo SDK 55, React Native 0.83.6, Hermes, TypeScript 5.9 strict mode with `noUncheckedIndexedAccess`.
- Jest runs in Node via `ts-jest`; `expo-sqlite` is mapped to `src/test/__mocks__/expo-sqlite.ts` and integration DB tests use `better-sqlite3` through `src/test/sqliteShim.ts`.
- NativeWind is enabled through `babel.config.js` and `tailwind.config.js` (`darkMode: 'class'`, content: `App.tsx` + `src/**/*.{ts,tsx}`).

## Data flow and persistence

- Initial/incremental sync stores WaniKani data in SQLite using `updated_after` cursors in `sync_cursors`.
- Reviews, lessons, search, dashboard, and subject detail reads query local DB.
- Review results / lesson starts / study-material edits are queued in `pending_progress` and `pending_study_materials`; sync flushes pending writes before fetching remote updates.
- `activeSync` in sync code prevents concurrent syncs. Foreground lifecycle sync runs when stale (>15 min); background only flushes pending writes if any.
- Full refresh clears cached remote data and cursors but must preserve pending local writes.

## Important files

- `App.tsx` — app root, theme provider, notification tap handling.
- `src/navigation/AppNavigator.tsx` — auth gate, screen routing, lifecycle sync.
- `src/domain/db/schema.ts` — SQLite schema/migrations.
- `src/domain/db/database.ts` — DB singleton/opening and high-level writes.
- `src/domain/sync/syncService.ts` — incremental sync and pending-write flush.
- `src/domain/study/reviewSession.ts` — in-memory review state machine.
- `src/domain/answers/answerChecker.ts` — answer validation/fuzzy matching/kana logic.
- `src/domain/settings/settingsStore.ts` and `src/domain/sync/syncStore.ts` — Zustand stores.
- `src/test/testDb.ts`, `src/test/factories.ts`, `src/test/mockApi.ts` — test DB/data/API helpers.
- `config-plugins/withPredictiveBackGesture.js` — Android predictive-back manifest plugin.

## Code conventions and gotchas

- Domain functions touching DB/API/storage are async; pure helpers stay synchronous.
- React Native has no `DOMException`; detect aborts with `error instanceof Error && error.name === 'AbortError'`.
- SQLite uses raw `getAllAsync`/`runAsync`, no ORM. Foreign keys are enforced.
- For cache resets, delete child rows before `subjects`: `assignments`, `study_materials`, `review_stats`, `audio_urls`, `subject_progress`, `pending_study_materials`.
- Use `colorForSubjectType()` from `src/theme/subjectColors.ts`; do not duplicate subject-type color switches.
- Styling is mixed NativeWind `className` plus theme inline styles. Preserve existing local style approach in the file you touch rather than mass-converting.
- Keyboard-aware bottom UI (e.g. `FloatingReviewPill`) should use `useKeyboardHeight()` from `src/hooks/useKeyboardHeight.ts` on Android, with `softwareKeyboardLayoutMode: "pan"` in `app.json`.
- Dashboard Lessons/Reviews action cards (`StudyAction` in `src/screens/DashboardScreen.tsx`) use absolute labels with large `tracking-ultra2`; do not add a `right` constraint to the label or it truncates (`LESSO...`, `RE...`). Let the arrow pill paint over overlap.
- Radical `characters` can be `null`; render `characters ?? ''` and never fall back to `slug` because it leaks the answer.
- Image-only radicals use `character_images`; prefer PNG, with SVG/CSS fallback via `src/domain/subjects/radicalSvg.ts`.
- API `kana_vocabulary` is stored/rendered locally as `vocabulary`; handle both API/local names.
- Study material sync should skip rows whose `subject_id` is absent locally rather than aborting a batch.
- Pending sync 422s mean stale/invalid local writes; delete them with diagnostics.

## Session navigation

- Do not use `Alert.alert` for Review/Lesson back-navigation confirmations; it conflicts with Android predictive back. Use `ConfirmLeaveBanner`.
- `ReviewSessionScreen` and `LessonSessionScreen` store `beforeRemove` actions in a ref; banner confirm dispatches the stored action or falls back to `navigation.goBack()`.

## Expo/native constraints

- `app.json` uses custom scheme `yomiji`, package/bundle `app.yomiji`, and plugins `expo-secure-store`, `expo-sqlite`, `expo-notifications`, `./config-plugins/withPredictiveBackGesture`.
- `npx expo prebuild --clean` wipes generated `android/` and `ios/`; route Android manifest changes through config plugins, not manual native edits.
- Expo SDK 55 lacks a native `predictiveBackGestureEnabled` config option; keep using `config-plugins/withPredictiveBackGesture.js` for `android:enableOnBackInvokedCallback="true"`.
- Android `softwareKeyboardLayoutMode` is `"pan"` (not `"resize"`). Keyboard-aware footers handle their own bottom padding via `useKeyboardHeight()`.

## Testing notes

- Unit tests are `*.test.ts`; integration-style DB tests still match Jest's `**/*.test.ts` pattern (e.g. `*.integration.test.ts`).
- Tests use `createTestDatabase()` from `src/test/testDb.ts`; call returned `cleanup` when following existing patterns.
- Use factories from `src/test/factories.ts` and `createMockApi()` from `src/test/mockApi.ts`; mock API calls are inspectable with `mockApi.getCalls('method')`.
- React Native APIs need mocks or should stay out of unit-tested domain modules.

## Release/versioning

- Do not bump versions unless asked. Pre-1.0 semver: patch for fixes, minor for features, major for milestones.
- `pnpm version:bump` updates `package.json`, `app.json` (`version`, Android `versionCode`, iOS `buildNumber`, runtime versions), and `android/app/build.gradle`, then commits `Release vX.Y.Z` and tags `vX.Y.Z`.
- Android release workflow runs on `v*` tags or manual dispatch. CI uses Node 22, pnpm 9, Java 17, runs install/typecheck/tests, then `eas build --platform android --profile production --local --output build.apk`.
- Release APK signing requires `YOMIJI_KEYSTORE_BASE64` and `YOMIJI_KEYSTORE_PASSWORD`; alias is `yomiji`. Release builds fail closed if signing material is missing; debug builds use local debug signing.

## CI build gotchas

### Kotlin daemon memory (Metaspace OOM)

`org.gradle.jvmargs` in `android/gradle.properties` only affects the Gradle daemon. KSP and the Kotlin compiler run in a **separate Kotlin daemon** with its own JVM args. Without `kotlin.daemon.jvmargs`, the Kotlin daemon defaults to ~256m Metaspace, which is far too small for expo-modules-core annotation processing. The CI build will fail with `kspReleaseKotlin: OutOfMemoryError: Metaspace`.

`android/gradle.properties` must contain both:
```properties
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8
kotlin.daemon.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
```

If the CI runner has limited RAM (e.g. GitHub `ubuntu-latest` = ~7GB on older images), also add swap space via `pierotofy/set-swap-space@master` in the workflow (6GB). Newer `ubuntu-24.04` runners have 15GB; the swap step is a safety net.

### `@babel/plugin-transform-react-jsx` dependency

`babel-preset-expo` requires `@babel/plugin-transform-react-jsx` at build time (for `createReleaseUpdatesResources`), but it is **not** a transitive dependency. It must be an explicit `devDependency`:

```json
"@babel/plugin-transform-react-jsx": "^7.25.9"
```

Without it, the release build fails with `[BABEL] Cannot find module '@babel/plugin-transform-react-jsx'`.

### EAS expo-updates channel warning (benign)

The CI build logs a warning about `update.url` being set in `app.json` without an EAS Update channel. This is benign for local builds — EAS Update is simply disabled. No action needed unless the project adopts OTA updates.

### `expo-asset` peer dependency (benign)

`expo doctor` warns about `expo-audio` requiring `expo-asset` as a peer. The module is autolinked at build time regardless, so this is non-fatal. Only add it if the project explicitly imports `expo-asset` directly.
