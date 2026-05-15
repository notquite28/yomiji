# Local Notifications — Technical Reference

> expo-notifications v55 (Expo SDK 55) | Local notifications only | Updated 2026-05-13

## 1. API Reference

### 1.1 Requesting Permissions

```ts
import * as Notifications from "expo-notifications";

// Check current permission state
const settings = await Notifications.getPermissionsAsync();
// settings.granted: boolean
// settings.ios?.status: IosAuthorizationStatus (NOT_DETERMINED=0, DENIED=1, AUTHORIZED=2, PROVISIONAL=3, EPHEMERAL=4)
// settings.ios?.allowsBadge, allowsAlert, allowsSound, etc.

// Request permissions (defaults: alert + badge + sound)
const result = await Notifications.requestPermissionsAsync({
  ios: {
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
  },
});
// result.granted === true means fully authorized
```

**Key points:**

- On Android 13+, the system shows a permission dialog the first time. After that, the user must go to system settings to change it.
- On iOS, you can request `allowProvisional: true` to send quiet notifications to Notification Center without explicit user opt-in (iOS 12+). The user then opts in explicitly.
- Calling `requestPermissionsAsync` when already granted returns immediately without a prompt.
- On iOS, check `ios.status` not just `granted` — `PROVISIONAL` is a valid non-granted state that still delivers to Notification Center.

### 1.2 Setting the Notification Handler

**Required.** Without this, foreground notifications are silently discarded.

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // heads-up display
    shouldShowList: true, // notification shade / Notification Center
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
```

This must be called at module scope (not inside a component), typically in `App.tsx`. The handler must respond within 3 seconds or the notification is discarded.

### 1.3 Scheduling a Notification

The trigger input must be an object with a `type` field (plain `Date` or `number` is deprecated).

```ts
// One-time notification at a specific Date
const id = await Notifications.scheduleNotificationAsync({
  content: {
    title: "Reviews Available",
    body: "You have 42 reviews waiting!",
    data: { screen: "reviews" },
    badge: 42, // iOS: sets badge on the notification
    sound: "default", // or false for silent
  },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date("2026-05-14T01:00:00Z"),
  },
});

// Time interval (one-time or repeating)
await Notifications.scheduleNotificationAsync({
  content: { title: "Hourly check" },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: 3600,
    repeats: false, // default false
  },
});

// Repeating time interval — iOS requires seconds >= 60
await Notifications.scheduleNotificationAsync({
  content: { title: "Drink water" },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: 1200,
    repeats: true,
  },
});

// Daily at specific time
await Notifications.scheduleNotificationAsync({
  content: { title: "Daily review" },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: 9,
    minute: 0,
  },
});
```

Available trigger types (`SchedulableTriggerInputTypes` enum):
| Type | Platform | Description |
|------|----------|-------------|
| `DATE` | both | One-shot at exact Date/timestamp |
| `TIME_INTERVAL` | both | After N seconds; optionally repeating |
| `DAILY` | Android-primary (iOS uses calendar) | Daily at hour:minute |
| `WEEKLY` | Android-primary | Weekly on weekday at hour:minute |
| `MONTHLY` | Android-primary | Monthly on day at hour:minute |
| `YEARLY` | Android-primary | Yearly on month/day at hour:minute |
| `CALENDAR` | iOS-primary | Matches date components (like cron) |

### 1.4 Canceling / Updating Scheduled Notifications

```ts
// Cancel a specific notification by its ID
await Notifications.cancelScheduledNotificationAsync(notificationId);

// Cancel ALL scheduled notifications
await Notifications.cancelAllScheduledNotificationsAsync();

// Inspect what's currently scheduled
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
// Returns NotificationRequest[] with identifier, content, trigger
```

**Update pattern:** There is no "update" API. To change a scheduled notification, cancel the old one and schedule a new one. You can pass a custom `identifier` to maintain stable IDs:

```ts
await Notifications.scheduleNotificationAsync({
  identifier: 'review-alert-hour-3',  // custom stable ID
  content: { ... },
  trigger: { ... },
});
// Later, cancel by the same ID:
await Notifications.cancelScheduledNotificationAsync('review-alert-hour-3');
```

### 1.5 Badge Count

```ts
import * as Notifications from "expo-notifications";

// Set badge count
await Notifications.setBadgeCountAsync(42);

// Read current badge count
const count = await Notifications.getBadgeCountAsync();

// Clear badge
await Notifications.setBadgeCountAsync(0);
```

- **iOS**: Badge appears on app icon. Supported natively.
- **Android**: Badge support depends on the launcher. Most stock launchers (Pixel, Samsung) support badges via `NotificationChannel` settings. The badge number is tied to visible notifications, not a standalone counter — expo-notifications uses the `ShortcutBadger` library under the hood.
- Setting `badge` in notification `content` also updates the badge on iOS.

### 1.6 Handling Notification Tap (Deep Link)

```ts
// In App.tsx or a top-level component
useEffect(() => {
  // Foreground tap (app was running)
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      // data is the arbitrary object you set in content.data
      if (data.screen === "reviews") {
        navigationRef.navigate("ReviewSession");
      }
    },
  );

  return () => subscription.remove();
}, []);
```

For cold start / background tap:

```ts
// Check if app was opened from a notification tap
const lastResponse = Notifications.getLastNotificationResponse();
if (lastResponse) {
  const data = lastResponse.notification.request.content.data;
  // Navigate accordingly
  Notifications.clearLastNotificationResponse(); // avoid re-processing
}
```

The hook `useLastNotificationResponse()` is also available for React components.

**Action identifiers:**

- `Notifications.DEFAULT_ACTION_IDENTIFIER` (`'expo.modules.notifications.actions.default'`) — user tapped the notification body.
- Custom actions require `setNotificationCategoryAsync` (iOS-only for interactive buttons).

---

## 2. Platform Limitations

### 2.1 iOS

| Constraint                          | Detail                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scheduled notification limit**    | 64 pending notification requests. Beyond that, iOS silently drops the oldest. This is a hard `UNUserNotificationCenter` limit.                                       |
| **Repeating time interval minimum** | 60 seconds for `TimeIntervalNotificationTrigger` with `repeats: true`.                                                                                               |
| **Calendar triggers**               | Fully supported via `UNCalendarNotificationTrigger`. Rich date-component matching.                                                                                   |
| **Badge**                           | Native support on app icon via `setBadgeCountAsync`.                                                                                                                 |
| **Background delivery**             | Scheduled notifications fire even if the app is killed. The system wakes the app briefly for background notification handlers.                                       |
| **Notification categories**         | Supported — interactive buttons via `setNotificationCategoryAsync`.                                                                                                  |
| **Sound**                           | Use `'default'` for system sound, or provide a custom sound file. Custom sounds must be listed in `expo-notifications` plugin config's `sounds` array in `app.json`. |
| **Provisional auth**                | Can send quiet notifications without explicit permission via `allowProvisional: true`.                                                                               |

### 2.2 Android

| Constraint                      | Detail                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scheduled notification cap**  | No hard limit like iOS's 64, but `AlarmManager` has practical limits. Scheduling hundreds of alarms is inefficient and may trigger battery optimization killing.                                                                                                                                                                                                                                               |
| **Exact vs. inexact alarms**    | **Critical difference.** On Android 12+ (API 31+), apps need `SCHEDULE_EXACT_ALARM` permission for exact alarms. Expo-notifications handles this: if `canScheduleExactAlarms()` is true, it uses `setExactAndAllowWhileIdle`; otherwise falls back to inexact `setAndAllowWhileIdle`. **Without exact alarm permission, notifications can be delayed significantly (minutes to hours) by Doze/Battery Saver.** |
| **Doze mode**                   | In Doze mode, inexact alarms are deferred to maintenance windows (~every few minutes to ~every few hours depending on Doze depth). Exact alarms bypass Doze.                                                                                                                                                                                                                                                   |
| **Notification channels**       | Required on Android 8+. Each notification must be associated with a channel. expo-notifications creates a default channel. You can create custom channels with `setNotificationChannelAsync`.                                                                                                                                                                                                                  |
| **Badge**                       | Supported on most launchers but not guaranteed. Controlled via `NotificationChannel.setShowBadge()`.                                                                                                                                                                                                                                                                                                           |
| **Background delivery**         | Scheduled notifications fire via `AlarmManager` + `PendingIntent`. They work when the app is killed, but Doze mode can delay inexact alarms.                                                                                                                                                                                                                                                                   |
| **WorkManager vs AlarmManager** | expo-notifications uses `AlarmManager` exclusively (not WorkManager). This means it's suitable for time-precise triggers but doesn't benefit from WorkManager's battery-efficient batching.                                                                                                                                                                                                                    |
| **Android 14+ (API 34)**        | Foreground service restrictions may affect background notification processing. Expo's `expo-notifications` handles this internally.                                                                                                                                                                                                                                                                            |

### 2.3 Platform Comparison Summary

| Feature                    | iOS                     | Android                                                |
| -------------------------- | ----------------------- | ------------------------------------------------------ |
| Pending notification limit | 64                      | No hard limit (practical ~100s)                        |
| Exact timing               | Yes (always)            | Requires SCHEDULE_EXACT_ALARM permission (Android 12+) |
| Badge on icon              | Yes (native)            | Launcher-dependent                                     |
| Notification channels      | N/A                     | Required (Android 8+)                                  |
| Doze / power saving        | No equivalent           | Delays inexact alarms                                  |
| Custom sounds              | Yes (via config plugin) | Yes (via channel settings)                             |
| Interactive actions        | Yes (categories)        | Limited (via channel)                                  |

---

## 3. Notification Scheduling Strategies

### Context: WaniKani Review Availability

WaniKani assignments have `available_at` timestamps. At any time, we can compute which future hours will have new reviews. The Tsurukame app computes `upcomingReviews[hour]` — an array indexed by hours from now, where each entry is the number of new reviews in that hour.

### Strategy A: One Notification Per Upcoming Review Hour

```ts
async function scheduleReviewNotifications(
  availableReviewCount: number,
  upcomingReviews: number[], // indexed by hour from now
) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const settings = await Notifications.getPermissionsAsync();
  if (!settings.granted) return;

  let cumulative = availableReviewCount;
  let scheduled = 0;

  for (let hour = 0; hour < upcomingReviews.length && scheduled < 50; hour++) {
    const newReviews = upcomingReviews[hour];
    if (newReviews === 0) continue;

    cumulative += newReviews;
    const triggerDate = new Date(Date.now() + hour * 3600_000);

    if (triggerDate <= new Date()) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `review-hour-${hour}`,
      content: {
        title: "Reviews Available",
        body: `${cumulative} reviews available (${newReviews} new)`,
        badge: cumulative,
        data: { screen: "reviews" },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    scheduled++;
  }
}
```

**Pros:** Precise per-hour alerts; badge updates cumulatively; matches Tsurukame's proven pattern.
**Cons:** Must stay under iOS's 64 limit; requires rescheduling on sync; Android inexact alarms may delay.

**This is the recommended strategy** — it's what Tsurukame uses and it matches user expectations.

### Strategy B: Single Daily Notification

```ts
await Notifications.scheduleNotificationAsync({
  identifier: "daily-review-reminder",
  content: { title: "WaniKani", body: "Check your reviews!" },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: 9,
    minute: 0,
  },
});
```

**Pros:** Simple; one notification; works reliably across platforms.
**Cons:** Doesn't alert at the actual review-available time; no badge count update; poor UX for spaced repetition.

### Strategy C: Reschedule on App Foreground (Recommended Enhancement)

Combine Strategy A with rescheduling on every app foreground and sync:

```ts
// In AppNavigator or a dedicated hook
useEffect(() => {
  const sub = AppState.addEventListener("change", async (nextState) => {
    if (nextState === "active") {
      await syncAndRescheduleNotifications();
    }
  });
  return () => sub.remove();
}, []);
```

This is the Tsurukame pattern: `nc.removeAllPendingNotificationRequests()` then reschedule based on fresh data.

### Recommended Approach: Strategy A + C

1. After every sync, compute `upcomingReviews` from assignments' `available_at`.
2. Cancel all pending notifications.
3. Schedule one `DATE` trigger per hour that has reviews, up to ~50 notifications (leaving headroom under iOS's 64).
4. On app foreground (if stale >15 min), re-sync and reschedule.
5. Set badge count immediately to current available reviews.
6. Suppress all notifications and clear badge when vacation mode is active.

---

## 4. Gotchas and Known Issues

### 4.1 Development vs. Production

- **Notifications do NOT fire in Expo Go on physical devices for scheduled notifications** — this is a known Expo Go limitation. You must use a development build (`expo run:ios` / `expo run:android`) to test scheduled notifications.
- iOS Simulator does not support push notifications, but **local scheduled notifications do work** in Simulator.
- Android Emulator supports local notifications fully.

### 4.2 Handler Timeout

The `setNotificationHandler` callback has a **3-second timeout**. If your async handler takes longer, the notification is silently discarded. Keep the handler lean — do not do network calls or heavy computation.

### 4.3 iOS 64-Notification Limit

iOS silently drops the oldest pending notification when you exceed 64. There is no error. Always check `getAllScheduledNotificationsAsync()` in development to verify you're not losing notifications. Use stable identifiers so you can reason about what's scheduled.

### 4.4 Android Exact Alarm Permission (Android 12+)

On Android 12+, `SCHEDULE_EXACT_ALARM` is auto-granted for apps installed from app stores. However:

- Users can revoke it in system settings.
- On some OEM ROMs (Xiaomi, Huawei), battery optimization may silently revoke it.
- Expo-notifications gracefully falls back to inexact alarms, but the timing becomes unreliable.
- **There is no expo API to check or request this permission.** You'd need a custom native module or `expo-intent-launcher` to direct users to settings.

### 4.5 Doze Mode (Android)

When the device enters Doze mode:

- Inexact alarms are deferred to maintenance windows.
- `setAndAllowWhileIdle` (expo's fallback) allows delivery during idle but may still be delayed.
- A full day of scheduled notifications will mostly fire correctly, but individual timing can be off by 5-15 minutes on Android without exact alarm permission.

### 4.6 Notification Content `badge` vs `setBadgeCountAsync`

On iOS, setting `badge` in notification `content` updates the badge when the notification fires. Setting `setBadgeCountAsync` updates it immediately. For the "current reviews available" use case, use `setBadgeCountAsync` for the live count, and set `badge` in scheduled notifications for future updates.

On Android, `badge` in content is informational only. Badge count is managed by the launcher and tied to visible notification count.

### 4.7 Sound Configuration

Custom sounds require the `expo-notifications` config plugin in `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "sounds": ["assets/sounds/review-bell.wav"]
        }
      ]
    ]
  }
}
```

Without this config, custom sound filenames in `content.sound` will fail silently. Use `'default'` for the system notification sound.

### 4.8 Vacation Mode

WaniKani vacation mode pauses review availability. When active:

- Clear all scheduled notifications.
- Set badge to 0.
- Skip notification scheduling until vacation ends.
- Re-schedule notifications when vacation ends and fresh sync completes.

### 4.9 `getNextTriggerDateAsync`

Useful for debugging — given a trigger input, returns the next date it would fire:

```ts
const nextDate = await Notifications.getNextTriggerDateAsync({
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour: 9,
  minute: 0,
});
// Returns Unix timestamp or null if never
```

### 4.10 Notification Channels (Android)

Create a channel before scheduling notifications that reference it:

```ts
await Notifications.setNotificationChannelAsync("reviews", {
  name: "Review Notifications",
  importance: Notifications.AndroidImportance.HIGH,
  sound: "default",
  vibrationPattern: [0, 250, 250, 250],
  showBadge: true,
});
```

If you reference a non-existent `channelId` in a trigger, Android will silently drop the notification.

### 4.11 Identifier Stability

If you don't pass a custom `identifier`, `scheduleNotificationAsync` generates a UUID. If you need to cancel or update a notification later, you must either:

- Store the returned identifier, or
- Use a deterministic custom identifier (like `'review-hour-3'`).

For the review-notification pattern, deterministic identifiers are strongly preferred.

---

## 5. Implementation Checklist

For Yomiji's M7 milestone:

1. **Permission flow** — Request on first launch or when user enables notifications in settings.
2. **Notification handler** — Set in `App.tsx` module scope.
3. **Scheduler module** — `src/domain/notifications/` (pure domain logic, no React imports):
   - `computeUpcomingReviews(assignments, now)` → array indexed by hour
   - `scheduleReviewNotifications(availableCount, upcomingReviews, settings)` → async
   - `clearReviewNotifications()` → cancel all + badge 0
4. **Foreground reschedule** — Hook into `AppState` change in `AppNavigator.tsx`.
5. **Sync integration** — After successful sync, call scheduler with fresh data.
6. **Vacation mode check** — Suppress notifications when `user.vacation_started_at` is set.
7. **Settings** — Wire up `notificationsAllReviews`, `notificationsBadging`, `notificationSounds` from app settings.
8. **Android notification channel** — Create `reviews` channel on app startup.
9. **Deep link handling** — Navigate to review session on notification tap.

### File Structure Proposal

```
src/domain/notifications/
  computeUpcomingReviews.ts     # pure: assignments[] → hourly review counts
  scheduleReviewNotifications.ts # side-effect: schedules expo notifications
  notificationSettings.ts       # reads settings, checks permissions
  types.ts                      # NotificationConfig, UpcomingReviews type
```

### Platform Support Matrix

| Feature                       | iOS              | Android                                 |
| ----------------------------- | ---------------- | --------------------------------------- |
| Scheduled local notifications | Yes (64 limit)   | Yes (exact alarm issues on Android 12+) |
| Badge count                   | Yes              | Launcher-dependent                      |
| Notification sound            | Yes              | Yes (via channel)                       |
| Deep link on tap              | Yes              | Yes                                     |
| Interactive actions           | Yes (categories) | Limited                                 |
| Doze-safe delivery            | N/A              | Inexact fallback                        |
