# Notifications: Codebase Analysis

What exists today, what is missing, and where hooks would go for implementing local review notifications.

---

## 1. Review Availability Data

### API Layer

`src/domain/api/types.ts` line 127 — `AssignmentData.available_at` is an optional ISO datetime string synced from the WaniKani API. This is the source of truth for when each assignment's next review becomes available.

### Sync Layer (`src/domain/sync/syncService.ts`)

- Assignments are synced incrementally via `runIncrementalSync()` using `updated_after` cursors.
- `putAssignments()` upserts into the `assignments` table including `available_at`.
- After a completed review, the API returns an updated assignment with a new `available_at` (the next SRS review time). This gets picked up on the next incremental sync.
- **No mechanism exists to trigger a sync immediately after a review completes** — the new `available_at` is only available after the next sync cycle.

### Assignment Repository (`src/domain/db/assignmentRepository.ts`)

- `countAvailableReviews(db)` — counts assignments where `available_at <= now()` and `srs_stage BETWEEN 1 AND 8`. This is the current review count shown on the dashboard.
- `clearAssignmentAvailableAt(db, assignmentId)` — nulls out `available_at` when a review is submitted (prevents double-counting before sync confirms the new time).

### Key Gap

After completing a review session locally, the app sets `available_at = NULL` on reviewed assignments. The **next** `available_at` for those items is unknown until the next sync fetches updated assignments. This means notification scheduling after a review session would need either:

- A sync call immediately after reviews complete, or
- Scheduling based on the current forecast (non-reviewed items only), then re-scheduling after the next sync.

---

## 2. Upcoming Reviews Forecast

### Dashboard Repository (`src/domain/dashboard/dashboardRepository.ts`)

`getReviewForecast(db, hours)` (line 53) is the core data source for notifications:

```sql
SELECT strftime('%Y-%m-%dT%H:00:00', available_at) AS bucket,
       COUNT(*) AS value
FROM assignments
WHERE srs_stage BETWEEN 1 AND 8
  AND available_at IS NOT NULL
  AND available_at > ?
  AND available_at <= ?
GROUP BY bucket
ORDER BY bucket
```

- Returns `ReviewForecastHour[]` — an array of `{ hour: string, count: number }` for each hour in the window.
- Default window is 48 hours; the dashboard currently requests 24 hours.
- Already indexed via `assignments_available_idx ON assignments (available_at, srs_stage)`.

### ReviewForecastChart (`src/components/ReviewForecastChart.tsx`)

- Pure presentation component. Renders a bar chart of 25 hour-buckets.
- No notification logic; purely visual.
- The `totalUpcoming` sum is computed in the component but not exposed outside it.

### What Is Missing for Notifications

- **No function to find the earliest upcoming review time.** The forecast buckets are hourly; notifications would need a precise `MIN(available_at)` query for scheduling.
- **No "next review at" aggregate** stored anywhere. Every computation is ad-hoc from the `assignments` table.
- The forecast depends on `available_at IS NOT NULL` — items currently being reviewed have `available_at = NULL` and drop out of the forecast until the next sync.

---

## 3. Settings Infrastructure

### Current System (`src/domain/settings/settings.ts`)

- Settings are stored as a single JSON blob in AsyncStorage under key `'appSettings'`.
- `loadSettings()` merges stored values over `defaultSettings`.
- `saveSettings(patch)` does a shallow merge and writes back.

### Notification Settings Stubs Already Exist

```typescript
notificationsAllReviews: boolean; // default: false
notificationsBadging: boolean; // default: true
notificationSounds: boolean; // default: false
```

These are **defined in the type and defaults but never read or consumed anywhere in the app**. The settings screen does not render notification toggle UI.

### What Is Missing

- **Settings screen UI** — `SettingsScreen.tsx` has zero references to "notification". No toggle rows for these three settings.
- **No notification service** — no module reads these settings and acts on them.
- **No permission request flow** — `expo-notifications` permission APIs are never called.

---

## 4. App Lifecycle and Sync Hooks

### AppNavigator (`src/navigation/AppNavigator.tsx`)

The lifecycle is well-structured with clear hook points:

| Event                               | Current Behavior                                  | Notification Hook Point                                                                        |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| App start (token loaded)            | `syncOnForeground()`                              | After sync completes, schedule notifications                                                   |
| Foreground (`background -> active`) | `syncOnForeground()` if >60s since last check     | After sync, re-schedule notifications                                                          |
| Background (`active -> background`) | `syncOnBackground()` flushes pending writes only  | Schedule notifications before going to background                                              |
| Sync completes                      | `setSyncRevision(n+1)` triggers dashboard refresh | **Ideal place**: after `runIncrementalSync` resolves, call `rescheduleReviewNotifications(db)` |

### Timing Constants

- `FOREGROUND_FULL_SYNC_INTERVAL_MS = 15 min` — full sync only if stale.
- `FOREGROUND_CHECK_INTERVAL_MS = 60s` — debounce between foreground checks.
- `BACKGROUND_PENDING_FLUSH_INTERVAL_MS = 60s` — background only flushes pending writes.

### Recommended Hook Strategy

1. **After any successful sync** (foreground or background) — call a notification scheduling function.
2. **On background transition** — schedule notifications for the next 24h window using current data.
3. **After review session completes** — trigger a lightweight sync to get updated `available_at` values, then re-schedule.

---

## 5. Database Schema

### Current State (`src/domain/db/schema.ts`)

- Single migration (version 1). No notification-related tables or columns.
- The `assignments` table with `available_at` (indexed) is the only timing data source.

### What Would Need to Be Added

Likely **no new tables** needed. Notification scheduling can be purely computed from:

- `assignments.available_at` (existing, indexed)
- `user.vacation_started_at` (existing — suppress notifications during vacation)
- Settings flags (existing in AsyncStorage)

If we want to persist scheduled notification IDs (to cancel/reschedule efficiently), a small table could help:

```sql
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id TEXT PRIMARY KEY,           -- expo notification ID
  trigger_at TEXT NOT NULL,      -- when it was scheduled for
  created_at TEXT NOT NULL
);
```

But this is optional — expo-notifications provides `cancelAllScheduledNotificationsAsync()` which is simpler.

---

## 6. expo-notifications Configuration

### Already Configured

- **`package.json`**: `"expo-notifications": "^55.0.22"` is installed.
- **`app.json` plugins**: `"expo-notifications"` is listed in the plugins array (handles auto-linking and native config).
- **Android permissions**: currently `[]` — would need `["notifications"]` for Android 13+ runtime permission.

### What Is Missing

- **No `setNotificationHandler`** call anywhere — the app has never configured how notifications appear when the app is in the foreground.
- **No permission request** — `requestPermissionsAsync()` is never called.
- **No `scheduleLocalNotificationAsync`** usage — no notifications are being scheduled.
- **No Android notification channel** configuration.
- **No notification response handler** — no code to handle the user tapping a notification.

---

## 7. Summary: What Exists vs. What Is Needed

### Exists (No New Code Needed)

| Component                             | Location                                     | Status                            |
| ------------------------------------- | -------------------------------------------- | --------------------------------- |
| `available_at` in assignments table   | `schema.ts`, `database.ts`                   | Ready to query                    |
| Index on `available_at`               | `assignments_available_idx`                  | Fast lookups                      |
| Hourly review forecast query          | `dashboardRepository.ts:getReviewForecast()` | Reusable as-is                    |
| Notification setting stubs            | `settings.ts` (3 boolean fields)             | Defined, not consumed             |
| expo-notifications dependency         | `package.json`                               | Installed                         |
| expo-notifications plugin             | `app.json`                                   | Configured                        |
| Foreground/background lifecycle hooks | `AppNavigator.tsx`                           | Clear sync completion hook points |
| Vacation mode detection               | `user.vacation_started_at` column            | Available for suppression         |

### Missing (Must Build)

| Component                        | Where It Would Live                                                        | Description                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Notification service**         | New `src/domain/notifications/notificationService.ts`                      | Core logic: query next review times, schedule/cancel local notifications                                        |
| **Next review time query**       | `src/domain/dashboard/dashboardRepository.ts` or `assignmentRepository.ts` | `SELECT MIN(available_at) FROM assignments WHERE available_at > now() AND srs_stage BETWEEN 1 AND 8`            |
| **Permission flow**              | `src/domain/notifications/` or `AppNavigator.tsx`                          | Request notification permissions on first launch or when user enables the setting                               |
| **Notification handler**         | `App.tsx` or `AppNavigator.tsx`                                            | `setNotificationHandler()` for foreground behavior + `addNotificationResponseReceivedListener` for tap handling |
| **Settings UI**                  | `src/screens/SettingsScreen.tsx`                                           | Toggle rows for the 3 existing notification settings                                                            |
| **Android notification channel** | `src/domain/notifications/`                                                | `setNotificationChannelAsync()` for Android 8+                                                                  |
| **Android permission**           | `app.json`                                                                 | Add `"notifications"` to `android.permissions`                                                                  |
| **Sync hook integration**        | `AppNavigator.tsx`                                                         | Call `rescheduleNotifications()` after sync completes and on background transition                              |
| **Post-review re-schedule**      | `ReviewSessionScreen.tsx` or `AppNavigator.tsx`                            | After completing reviews, optionally trigger sync then re-schedule                                              |

### Files That Would Need Changes

1. **`app.json`** — add Android notification permission
2. **`src/domain/notifications/notificationService.ts`** — NEW: core scheduling logic
3. **`src/domain/notifications/notificationPermissions.ts`** — NEW: permission request flow
4. **`src/domain/dashboard/dashboardRepository.ts`** — add `getNextReviewTime()` query
5. **`src/screens/SettingsScreen.tsx`** — add notification toggle UI section
6. **`src/navigation/AppNavigator.tsx`** — wire in notification scheduling after sync
7. **`App.tsx`** — add `setNotificationHandler()` at app startup
8. **`src/screens/ReviewSessionScreen.tsx`** — optional: trigger re-schedule after session ends
9. **`src/domain/db/schema.ts`** — optional: migration for `scheduled_notifications` table

### Dependency Chain

```
Permission flow → Notification service → Sync hooks → Settings UI
                                                  ↗
                        Review session completion ↗
```

The minimal viable path: request permissions, add `getNextReviewTime()`, create `notificationService.ts` with `rescheduleNotifications()`, wire it into `syncOnForeground()` completion, and add settings UI toggles.
