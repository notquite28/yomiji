# Notifications Research

> Collected 2026-05-13. Purpose: inform implementation of M7 (Notifications, Badges, and Links).

---

## 1. WaniKani Web Notifications

WaniKani's web application sends **email notifications** for the following events:

| Event             | Trigger                                          | User-configurable?              |
| ----------------- | ------------------------------------------------ | ------------------------------- |
| Reviews available | When SRS reviews become available (hourly check) | Yes, per-account email settings |
| Level up          | When user reaches a new level                    | Yes                             |

**Key observations:**

- WaniKani has **no native push notification system**. There is no official WaniKani mobile app.
- The WaniKani API does not expose a push/notification endpoint. All notification scheduling must be done **client-side** using local notifications.
- Third-party apps all implement notifications locally by computing when the next reviews arrive based on assignment `available_at` timestamps.
- The API provides `available_at` on assignments and the user's vacation status — sufficient data for local notification scheduling.

---

## 2. Tsurukame Notification Implementation (Deep Analysis)

Tsurukame uses **iOS local notifications exclusively** (no remote/push server). The implementation spans four files:

| File                                  | Responsibility                                          |
| ------------------------------------- | ------------------------------------------------------- |
| `ios/AppDelegate.swift`               | Core scheduling engine, badge updates, background fetch |
| `ios/AppSettingsViewController.swift` | Settings UI, permission flow                            |
| `ios/Settings.swift`                  | Persisted boolean settings                              |
| `ios/LocalCachingClient.swift`        | Data source: `upcomingReviews`, `availableReviewCount`  |

### 2.1 Settings (`ios/Settings.swift`, lines 182-184)

Three boolean settings persisted via NSUserDefaults:

```swift
@Setting(false, #keyPath(notificationsAllReviews)) static var notificationsAllReviews: Bool
@Setting(true,  #keyPath(notificationsBadging))    static var notificationsBadging: Bool
@Setting(false, #keyPath(notificationSounds))      static var notificationSounds: Bool
```

### 2.2 Permission Flow (`ios/AppSettingsViewController.swift`)

**When permissions are requested:**

1. **On login** (`AppDelegate.setMainViewControllerAnimated`): Proactively calls `requestAuthorization(options: [.badge, .alert, .sound])` silently — the result is ignored, it just seeds the system prompt early.

```swift
if !Screenshotter.isActive {
  let unc = UNUserNotificationCenter.current()
  unc.requestAuthorization(options: [.badge, .alert, .sound]) { _, _ in }
}
```

2. **On settings toggle** (`promptForNotifications`): When the user flips any notification switch ON, it runs a multi-state permission check:

```swift
private func promptForNotifications(switchView: UISwitch,
                                    handler: @escaping (Bool) -> Void) {
  if notificationHandler != nil { return }  // Prevent double-prompt

  if !switchView.isOn {
    handler(false)
    UIApplication.shared.applicationIconBadgeNumber = 0  // Clear badge immediately
    return
  }

  // Visually disable switch while waiting for permission
  switchView.setOn(false, animated: true)
  switchView.isEnabled = false

  notificationHandler = { granted in
    DispatchQueue.main.async {
      switchView.isEnabled = true
      switchView.setOn(granted, animated: true)
      handler(granted)
      self.notificationHandler = nil
    }
  }

  let center = UNUserNotificationCenter.current()
  center.getNotificationSettings { settings in
    switch settings.authorizationStatus {
    case .authorized, .provisional, .ephemeral:
      self.notificationHandler?(true)
    case .notDetermined:
      center.requestAuthorization(options: [.badge, .alert, .sound]) { granted, _ in
        self.notificationHandler?(granted)
      }
    case .denied:
      // Open iOS Settings so user can re-enable
      DispatchQueue.main.async {
        UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!, ...)
      }
    default:
      break
    }
  }
}
```

3. **On app becoming active** (`applicationDidBecomeActive`): Re-checks authorization status and resolves any pending `notificationHandler`. This handles the case where the user leaves the app to grant permissions in iOS Settings and returns:

```swift
@objc private func applicationDidBecomeActive(_: NSNotification) {
  if notificationHandler == nil { return }
  let center = UNUserNotificationCenter.current()
  center.getNotificationSettings { settings in
    var granted = settings.authorizationStatus == .authorized
    if #available(iOS 12.0, *) {
      granted = granted || settings.authorizationStatus == .provisional
    }
    self.notificationHandler?(granted)
  }
}
```

### 2.3 When Notifications Are Scheduled (`ios/AppDelegate.swift`)

Tsurukame schedules notifications at **exactly two points**:

| Trigger                          | Method                              | What happens                                   |
| -------------------------------- | ----------------------------------- | ---------------------------------------------- |
| App backgrounds (resigns active) | `applicationWillResignActive`       | Calls `updateAppBadgeCount()`                  |
| Background fetch completes       | `performFetchWithCompletionHandler` | Syncs data, then calls `updateAppBadgeCount()` |

```swift
func applicationWillResignActive(_: UIApplication) {
  services.reachability.stopNotifier()
  updateAppBadgeCount()
}

func application(_: UIApplication,
                 performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
  guard let lcc = services.localCachingClient else {
    completionHandler(.noData)
    return
  }
  lcc.sync(quick: true, progress: Progress(totalUnitCount: -1)).finally {
    self.updateAppBadgeCount()
    completionHandler(.newData)
  }
}
```

**Background fetch is registered** in `didFinishLaunchingWithOptions`:

```swift
application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)
```

And the `UIBackgroundModes` in `Info.plist` includes `fetch`.

### 2.4 The Scheduling Engine: `updateAppBadgeCount()`

This is the core function. It runs on the main thread inside a `getNotificationSettings` callback.

**Full algorithm with annotations:**

```swift
private func updateAppBadgeCount() {
  // STEP 1: Early exit if no notification feature is enabled
  if !Settings.notificationsAllReviews, !Settings.notificationsBadging {
    return
  }
  if services.localCachingClient == nil { return }

  // STEP 2: Gather data
  let user = services.localCachingClient.getUserInfo()
  let reviewCount = services.localCachingClient.availableReviewCount  // Current available
  let upcomingReviews = services.localCachingClient.upcomingReviews    // [Int] per hour

  // STEP 3: Vacation mode = clear everything
  if user?.hasVacationStartedAt ?? false {
    UIApplication.shared.applicationIconBadgeNumber = 0
    return
  }

  // STEP 4: Also send data to Apple Watch
  WatchHelper.sharedInstance.updatedData(client: services.localCachingClient)

  // STEP 5: Check OS-level permission before doing anything
  let nc = UNUserNotificationCenter.current()
  nc.getNotificationSettings { settings in
    switch settings.authorizationStatus {
    case .authorized, .ephemeral, .provisional: break
    default: return  // No permission = bail
    }

    DispatchQueue.main.async {
      // STEP 6: Set badge immediately to current review count
      UIApplication.shared.applicationIconBadgeNumber = reviewCount

      // STEP 7: Wipe all previously scheduled notifications
      nc.removeAllPendingNotificationRequests()

      // STEP 8: Find the next whole-hour boundary
      //   e.g. if now is 2:35pm, startDate = 3:00pm
      let startDate = NSCalendar.current.nextDate(
        after: Date(),
        matching: DateComponents(minute: 0, second: 0),
        matchingPolicy: .nextTime)!
      let startInterval = startDate.timeIntervalSinceNow

      var cumulativeReviews = reviewCount
      var notificationsAdded = 0

      // STEP 9: Iterate hourly slots
      for hour in 0 ..< upcomingReviews.count {
        let reviews = upcomingReviews[hour]
        if reviews == 0 { continue }  // Skip empty hours
        cumulativeReviews += reviews

        // STEP 10: Calculate when this notification fires
        let triggerTimeInterval = startInterval + (Double(hour) * 60 * 60)
        if triggerTimeInterval <= 0 {
          // Skip past-due notifications (avoid iOS crash)
          continue
        }

        // STEP 11: Build notification content
        let identifier = "badge-\(hour)"
        let content = UNMutableNotificationContent()

        // Alert body (only if user enabled "all reviews" AND system allows alerts)
        if settings.alertSetting == .enabled, Settings.notificationsAllReviews {
          content.body = "\(cumulativeReviews) review\(cumulativeReviews == 1 ? "" : "s") " +
            "available (\(upcomingReviews[hour]) new)"
        }
        // Badge number (only if badging enabled AND system allows badges)
        if settings.badgeSetting == .enabled, Settings.notificationsBadging {
          content.badge = NSNumber(value: cumulativeReviews)
        }
        // Sound (only if sounds enabled AND system allows sounds)
        if settings.soundSetting == .enabled, Settings.notificationSounds {
          content.sound = UNNotificationSound.default
        }

        // STEP 12: Schedule as one-shot, non-repeating
        let trigger = UNTimeIntervalNotificationTrigger(
          timeInterval: triggerTimeInterval, repeats: false)
        let request = UNNotificationRequest(
          identifier: identifier, content: content, trigger: trigger)
        nc.add(request, withCompletionHandler: nil)

        // STEP 13: iOS caps at 64 pending notifications
        notificationsAdded += 1
        if notificationsAdded >= kMaxLocalNotifications { break }
      }
    }
  }
}
```

**Key behavioral details:**

- **No notification title is set.** Only `body` is set on `UNMutableNotificationContent`. iOS uses the app name as the default title.
- **Badge is cumulative.** The badge number equals current reviews + all new reviews that will have appeared by that hour. At hour 0, badge = current reviews. At hour 3, badge = current reviews + reviews arriving at hours 1 + 2 + 3.
- **Notification body is also cumulative.** Body says `"{cumulative} reviews available ({new_this_hour} new)"`.
- **Identifier pattern:** `"badge-{hourIndex}"` — overwriting previous schedules at the same hour slot on each re-schedule.
- **Notifications are NOT grouped or threaded.** No `threadIdentifier` or `groupingIdentifier` is set. Each is an independent notification.
- **No notification tap handler.** Tsurukame does NOT implement `UNUserNotificationCenterDelegate`. Tapping a notification simply opens/brings the app to the foreground — it does NOT navigate to the review screen.
- **`kMaxLocalNotifications = 64`** — iOS documentation states that exceeding 64 pending notifications causes the system to evict older ones.

### 2.5 Data Source: `upcomingReviews` (`ios/LocalCachingClient.swift`)

The `upcomingReviews` property is a lazily-cached `[Int]` array — one integer per hour, where `upcomingReviews[0]` is the number of new reviews arriving in the next hour, `upcomingReviews[1]` is the hour after that, etc.

```swift
var upcomingReviews: [Int] {
    availableSubjects.reviewComposition.dropFirst().map { $0.availableReviews }
}
```

**Note:** `dropFirst()` skips the current hour (index 0), which contains currently-available reviews. The scheduling algorithm separately handles current reviews as the starting `reviewCount`.

The `reviewComposition` is built by `updateAvailableSubjects()`:

```swift
func updateAvailableSubjects() -> (Int, [ReviewComposition]) {
  guard getUserInfo() != nil else { return (0, []) }

  let now = Date()
  var lessonCount = 0,
      reviewComposition = Array(repeating: ReviewComposition(),
                                count: Int(SRSStage.maxDuration / 60 / 60) + 1)

  func iterateValidReview(_ type: TKMSubject.TypeEnum, hours: Int, stage: SRSStage) {
    guard hours < reviewComposition.count else { return }
    reviewComposition[hours].availableReviews += 1
    reviewComposition[hours].countByType[type, default: 0] += 1
    reviewComposition[hours].countByCategory[stage.category, default: 0] += 1
  }

  let showKanaOnlyVocab = Settings.showKanaOnlyVocab
  for assignment in getNonExcludedAssignments() {
    if !isValid(subjectId: assignment.subjectID) { continue }
    if !showKanaOnlyVocab, assignment.isKanaOnlyVocab { continue }

    if assignment.isLessonStage {
      lessonCount += 1
    } else if assignment.isReviewStage {
      let stage = assignment.srsStage,
          interval = max(0, assignment.availableAtDate.timeIntervalSince(now))
      iterateValidReview(assignment.subjectType,
                         hours: Int(ceil(interval / 3600)), stage: stage)
    }
  }
  return (lessonCount, reviewComposition)
}
```

**The `ReviewComposition` struct** carries richer data than needed for notifications (the notification system only uses `availableReviews`):

```swift
struct ReviewComposition {
  var availableReviews = 0,
      countByType: [TKMSubject.TypeEnum: Int] = [.radical: 0, .kanji: 0, .vocabulary: 0],
      countByCategory: [SRSStageCategory: Int] = [.apprentice: 0, .guru: 0,
                                                    .master: 0, .enlightened: 0]
}
```

**Array length:** `SRSStage.maxDuration / 3600 + 1` where `maxDuration = 10_364_400` seconds (~120 days). This means `reviewComposition` has ~2879 hourly slots, but only the first ~48-72 have non-zero values in practice. The 64-notification cap truncates well before this.

**Caching:** The `@Cached` property wrapper invalidates on sync, pending changes, or when the hour changes (`currentHourChanged()`). This means the data is always fresh when `updateAppBadgeCount()` reads it.

### 2.6 Vacation Mode Handling

Two-layer protection:

1. **In `updateAppBadgeCount()`:** If `user.hasVacationStartedAt` is true, badge is set to 0 and the function returns early — no notifications are scheduled.
2. **In `promptForNotifications()`:** When a switch is turned off, badge is explicitly cleared to 0.

There is no separate mechanism to detect vacation mode _starting_ — it's checked lazily at schedule time. If the user enters vacation mode while the app is backgrounded, existing scheduled notifications will still fire until the next `updateAppBadgeCount()` call (on next background fetch or foreground+background cycle).

### 2.7 Background Fetch

- Registered with `UIApplication.backgroundFetchIntervalMinimum` (iOS decides actual frequency).
- The fetch handler calls `sync(quick: true)` then `updateAppBadgeCount()`.
- Only the `fetch` UIBackgroundMode is declared — no `remote-notification`.
- There is no `BGTaskScheduler` usage (tsurukame predates iOS 13's newer background task API).

### 2.8 What Tsurukame Does NOT Do

| Feature                                  | Status                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Notification tap deep-linking to reviews | Not implemented (no `UNUserNotificationCenterDelegate`)                                                 |
| Notification grouping/threading          | Not implemented                                                                                         |
| Notification categories with actions     | Not implemented                                                                                         |
| Rich notifications (images, buttons)     | Not implemented                                                                                         |
| Remote/push notifications                | Not implemented                                                                                         |
| Critical alerts                          | Not implemented                                                                                         |
| Badge update while foregrounded          | Not needed (user can see the dashboard)                                                                 |
| Per-subject-type notification control    | Not implemented                                                                                         |
| "Next review at" notification            | Not explicitly — the hourly notification at the next whole hour when reviews appear serves this purpose |

---

## 3. Our Existing Settings (Stubbed)

In `src/domain/settings/settings.ts`, three notification settings are defined in `AppSettings` with defaults:

```typescript
export type AppSettings = {
  // ...
  notificationsAllReviews: boolean; // default: false
  notificationsBadging: boolean; // default: true
  notificationSounds: boolean; // default: false
  // ...
};
```

These are **stored and loaded** via `AsyncStorage` but **not wired up** to any notification scheduling or permission flow. The ROADMAP tracks:

- **M7**: Notification permission flow, local notification scheduling, badge count, vacation suppression, deep links.
- **M9**: Notifications settings section UI.

---

## 4. Platform Considerations (Expo / React Native)

| Concern                      | iOS                                           | Android                                              |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Local notifications          | `expo-notifications` supports scheduling      | `expo-notifications` supports scheduling             |
| Badge count                  | `expo-notifications` `setBadgeCountAsync()`   | Supported on most launchers via `expo-notifications` |
| Background fetch             | `expo-background-fetch` + `expo-task-manager` | More flexible with headless JS                       |
| Notification channels        | N/A                                           | Required for Android 8+; must configure channel      |
| Permission model             | Explicit `requestPermissionsAsync()`          | Auto-granted on most devices but should request      |
| Scheduled notification limit | 64 pending                                    | No hard limit, but battery concerns                  |

**Expo modules needed:**

- `expo-notifications` — scheduling, permissions, badge, channels
- `expo-background-fetch` + `expo-task-manager` — rescheduling on background fetch

---

## 5. Open Questions

1. **Should we use `expo-notifications` or a third-party library?** `expo-notifications` is the standard for Expo managed workflow and supports all required features.

2. **How do we compute `upcomingReviews` for scheduling?** We need a domain function that returns hourly review counts from local assignment data, similar to tsurukame's `reviewComposition`. We already have `available_at` on assignments.

3. **When should notifications be rescheduled?** Options: on app backgrounding (tsurukame approach), after sync completes, or both. Need to evaluate `AppState` listener feasibility in Expo.

4. **Background fetch frequency?** iOS controls this. Android is more flexible. Do we need to document this limitation?

5. **Android notification channels?** Required for Android 8+. Need to create a "Reviews" channel with appropriate importance and sound.

6. **Notification tap behavior?** Should tapping open directly to reviews or just the dashboard? Tsurukame just brings the app to foreground. This is a product decision.

7. **Badge accuracy on Android?** Not all launchers support badges. Should be set and let the system decide.

8. **Vacation mode integration?** Check user's vacation status from local data and suppress notifications/badges.

9. **Should notifications survive app updates?** Local notifications are cleared on app update. Re-schedule on app launch.

10. **iOS 64-notification limit?** With hourly scheduling over 24h this is unlikely to hit, but enforce a cap like tsurukame does.

---

## 6. Summary of What Needs to Be Built

1. **Domain layer**: `upcomingReviews()` function in `src/domain/` that returns hourly review counts from local assignment data.
2. **Notification service**: New `src/services/NotificationService.ts` that handles:
   - Permission request flow (proactive on login, reactive on settings toggle)
   - Scheduling local notifications based on upcoming reviews
   - Setting/clearing badge count
   - Vacation mode suppression
   - Re-scheduling on backgrounding and sync completion
3. **Settings UI**: Notifications section with three toggles (all reviews, badging, sounds).
4. **Lifecycle hooks**: `AppState` listener to trigger re-schedule on background/foreground.
5. **Background task**: Background fetch to sync and update badges (optional, Phase 2).
6. **Android notification channel**: Configure "Reviews" channel at app startup.
