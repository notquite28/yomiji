# Zustand State Management Migration

## Status: ✅ Complete (Phase 1 + 2)

## Rationale

Current state: React hooks (`useState`, `useRef`) exclusively. Settings loaded independently from AsyncStorage in 7 places. No reactive propagation across screens. Zustand (~1.1 KB gzipped) provides selector-based reactive global state with zero native deps.

## What moves to Zustand

| State Category | Store | Persisted? |
|---|---|---|
| App settings | `useSettingsStore` | Yes (via existing `loadSettings`/`saveSettings`) |
| Sync progress/error/revision | `useSyncStore` | No (ephemeral) |

## What stays as-is

- ReviewSession state machine (`useRef<ReviewSession>`)
- Local UI state (inputs, modals, scroll positions)
- Database connection (`openAppDatabase()` singleton)
- Auth token in AppNavigator (`useState<string | null>`)

## Phase 1: Settings Store

### Architecture

- `src/domain/settings/settingsStore.ts` — plain Zustand store (no `persist` middleware)
- `hydrate()` action calls existing `loadSettings()` once
- `updateSetting(key, value)` calls existing `saveSettings()` + updates store
- `_hydrated: boolean` flag gates app rendering (same pattern as AppThemeProvider)
- `settings.ts` keeps all types, defaults, migrations, `loadSettings`, `saveSettings`

### Files changed

| File | Change |
|---|---|
| `package.json` | Add `zustand@^5` |
| `src/domain/settings/settingsStore.ts` | **New** — settings store |
| `src/domain/sync/syncStore.ts` | **New** — sync store |
| `src/theme/AppThemeProvider.tsx` | Read `appearance` from store; hydrate once |
| `src/navigation/AppNavigator.tsx` | Removed 3 useState for sync; uses syncStore.getState() |
| `src/screens/DashboardScreen.tsx` | Removed dead loadSettings + sync props; reads both stores |
| `src/screens/ReviewSessionScreen.tsx` | Replace `loadSettings()` + `useState<AppSettings>` with store |
| `src/screens/LessonSessionScreen.tsx` | Same |
| `src/screens/LessonPickerScreen.tsx` | Same |
| `src/screens/SubjectDetailScreen.tsx` | Replace with scoped selectors; drop `subjectSettings` state |
| `src/screens/SettingsScreen.tsx` | Replace `saveSettings()` with `updateSetting()` |
| `src/components/ReviewQuickSettings.tsx` | Subscribe to store directly; drop props |
| `src/domain/notifications/notificationService.ts` | `readNotificationConfig()` → synchronous via `getState()` |

### Tests updated

| File | Change |
|---|---|
| `src/domain/notifications/notificationService.test.ts` | Replace `loadSettings` mock with `useSettingsStore.setState()` |

### Verification

```bash
pnpm typecheck && pnpm test  # 233/233 pass, typecheck clean
```

## Phase 2: Sync Store ✅

### Architecture

- `src/domain/sync/syncStore.ts` — non-persisted store for sync state
- `syncProgress`, `syncError`, `syncRevision` + setter actions
- AppNavigator removed 3 useState declarations; uses `getState()` in async callbacks
- DashboardScreen removed sync props; reads from store via selectors

## Rollback

- `loadSettings`/`saveSettings` are never deleted — just unused by screens
- Store file can be deleted; screens revert to direct `loadSettings`/`saveSettings` calls
- `git checkout -- .` restores everything
- Zero data migration risk — AsyncStorage keys unchanged
