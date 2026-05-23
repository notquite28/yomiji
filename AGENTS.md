# Repository Guidelines

## Project Shape

- Yomiji is a single-package Expo/React Native app (`package.json` main: `expo/AppEntry.js`); `App.tsx` is the real root and imports `global.css` for NativeWind.
- `src/navigation/AppNavigator.tsx` owns the auth gate, foreground/background sync, notification permission flow, and route registration.
- Treat SQLite as the source of truth after login. Screens should use `src/domain/**` repositories/services instead of direct SQL or WaniKani API calls.
- Sync path is WaniKani API -> `src/domain/sync/syncService.ts` -> SQLite repositories -> screens. Pending review/lesson/study-material writes are flushed before remote fetches.
- `android/` is checked in and release-relevant, not disposable Expo output. Keep native config aligned with `app.json` and Expo plugins.

## Commands

```sh
pnpm install
pnpm start              # expo start --dev-client; requires a dev build
pnpm start -- --clear   # clear Metro cache
pnpm android            # expo run:android
pnpm ios                # expo run:ios
pnpm web                # expo start --web; experimental/unsupported
pnpm typecheck          # tsc --noEmit
pnpm test               # jest --runInBand
pnpm test -- <file>     # focused Jest run
pnpm exec expo install --check
```

- Use pnpm; CI uses pnpm 9, Node 22, and Java 17.
- There is no lint or formatter script in `package.json`.
- `pnpm start` uses `expo start --dev-client`; run/install a development build first with `pnpm android` or `pnpm ios`.

## Verification

- CI runs `pnpm install --frozen-lockfile`, `pnpm typecheck`, then `pnpm test` before Android release builds.
- Jest is Node + ts-jest and only matches `**/*.test.ts`; TSX tests are not picked up unless config changes.
- Focused integration examples:

```sh
pnpm test -- src/domain/db/dataIntegrity.integration.test.ts
pnpm test -- src/domain/sync/syncService.integration.test.ts
pnpm test -- src/domain/sync/errorHandling.integration.test.ts
pnpm test -- src/domain/study/pendingWrites.integration.test.ts
```

## Test Harness Gotchas

- `expo-sqlite` is mapped to `src/test/__mocks__/expo-sqlite.ts`; `openDatabaseAsync` intentionally throws in Jest.
- DB tests should create in-memory databases through `createTestDatabase()` from `src/test/testDb.ts` or `createTestDb()` from `src/test/sqliteShim.ts`, then close them in cleanup.
- Prefer fixtures/helpers in `src/test/factories.ts` and `src/test/mockApi.ts`; avoid hand-rolled WaniKani payloads and ad hoc SQL setup.

## Code Constraints

- TypeScript is strict with `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch`; fix types rather than loosening config.
- Preserve offline-first behavior: cached data must keep working, local writes must queue, and network/auth/rate-limit errors should stay explicit and sanitized.
- Sync is single-flight in `syncService.ts` via module-scoped promises; keep new refresh paths deduped and preserve pending-write flushing.
- Error handling convention: clear stored auth token on WaniKani 401/403, log sanitized sync errors, and only swallow best-effort failures such as notification scheduling/audio teardown.
- Styling is NativeWind-first (`className`, `dark:` variants). Keep inline/theme styles for dynamic values React Native cannot express statically: subject colors, Switch colors, charts, shadows, placeholder/selection colors.
- `AppThemeProvider` supplies navigation colors and dynamic theme values; Tailwind scans only `App.tsx` and `src/**/*.{ts,tsx}`.

## Release Notes

- Prefer `pnpm version:bump <patch|minor|major>` over manual version edits; it updates `package.json`, `app.json`, and `android/app/build.gradle`, then commits `Release vX.Y.Z` and tags `vX.Y.Z`.
- Android release CI runs on `v*` tags or manual dispatch and builds `eas build --platform android --profile production --local --output build.apk`.
- Release signing expects `EXPO_TOKEN`, `YOMIJI_KEYSTORE_BASE64`, and `YOMIJI_KEYSTORE_PASSWORD`; release key alias is `yomiji`.
