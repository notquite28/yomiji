# React Native Port Roadmap

This roadmap tracks the React Native port in the repository root. The Swift/UIKit app in `tsurukame/` remains the behavior reference, and `tsurukame/REACT_NATIVE_PORT_PRD.md` remains the product requirements source.

## Guiding Principles

- [x] Preserve Tsurukame iOS learning semantics while building Android-native interaction patterns.
- [x] Keep the app offline-first after initial sync.
- [x] Keep background work battery-conscious and user-visible.
- [x] Prefer local cache reads for dashboard, study sessions, search, and subject details.
- [x] Queue local writes transactionally before attempting network sync.
- [ ] Avoid logging API tokens, Authorization headers, or sensitive request payloads.

## Current Foundation

- [x] Expo React Native TypeScript app shell in repository root.
- [x] React Navigation native stack with login, dashboard, settings, reviews, lessons, and lesson picker routes.
- [x] WaniKani API token login using `/user` validation.
- [x] Secure API token storage through platform secure storage.
- [x] Local SQLite schema for synced API collections, sync cursors, pending writes, audio URLs, and diagnostics.
- [x] Incremental sync for user, subjects, assignments, study materials, level progressions, voice actors, and review statistics.
- [x] Pending queue sync for review submissions, lesson starts, and study material edits.
- [x] Battery-conscious lifecycle sync: stale foreground sync and pending-write-only background flush.
- [x] Dashboard with username, level, lesson count (with apprentice-limit gating), review count, SRS bucket counts, sync status, and cache stats.
- [x] Lesson session with configurable ordering, filtering, batch size, and interleaving.
- [x] Lesson picker grouped by level and subject type with multi-select.
- [x] Interactive review flow using cached available review assignments and the two-queue review state machine.
- [x] Initial answer checker port with normalization, kana handling, meanings, synonyms, blacklists, fuzzy matching, other readings, invalid characters, and okurigana detection.
- [x] Android-first reading input with Tsurukame-style romaji-to-kana conversion.
- [x] CSS-aware image-only radical rendering in reviews, lessons, and diagnostics.
- [x] Unit tests for answer checking, review session behavior, radical SVG fallback handling, and study queue image selection.

## M0: Architecture Hardening

- [ ] Document the SQLite schema mapping versus the original protobuf model.
- [ ] Add migration tests for schema creation and future migrations.
- [ ] Add sanitized error logging helpers and wire API/sync failures into `error_log`.
- [ ] Add a diagnostics screen for app version, sync state, pending queue counts, and sanitized export.
- [x] Add a radical image diagnostics preview for cached image-only radicals.
- [ ] Add network-state awareness so sync errors distinguish offline, timeout, auth, and rate-limit states.
- [ ] Add a simple local repository layer boundary for subjects, assignments, study materials, and review stats.

## M1: Sync Reliability

- [ ] Add integration tests for WaniKani pagination.
- [ ] Add integration tests for incremental `updated_after` cursors.
- [ ] Add integration tests for pending review progress and lesson starts.
- [ ] Add integration tests for study material create/update flows.
- [ ] Handle 401 and 403 by marking the token unauthorized and prompting re-authentication.
- [ ] Handle hibernating-account errors with actionable copy.
- [ ] Handle 429 rate limiting with retry timing and visible status.
- [ ] Preserve pending writes across full refreshes.
- [ ] Add a manual full refresh action that clears remote cache data without dropping pending local writes.

## M2: Dashboard Parity

- [ ] Match the iOS dashboard information hierarchy more closely.
- [ ] Show WaniKani recommended lessons separately from Advanced lesson pool if the needed data is available.
- [ ] Add upcoming reviews chart for at least 48 hours.
- [ ] Add current-level progress charts for radicals, kanji, and vocabulary.
- [ ] Add recent lessons section.
- [ ] Add recent mistakes section.
- [ ] Add apprentice leeches and all leeches sections.
- [ ] Add burned item practice entry point.
- [ ] Add excluded items entry point.
- [ ] Update dashboard counts immediately after local review and lesson actions.
- [ ] Refresh dashboard on hour boundaries while foregrounded without continuous background timers.

## M3: Review Session Parity

### Phase 1: Core State Machine

- [x] Extract shared UI components into `src/components/` (`ScreenLayout`, `SubjectHeroCard`).
- [x] Add shared `SrsBar` component.
- [x] Replace flat review loop with two-queue state machine (activeQueue + reviewQueue) modeled after iOS `ReviewSession.swift`.
- [x] Re-queue wrong answers with 5-item return delay.
- [x] Track meaningWrong/readingWrong/meaningWrongCount/readingWrongCount per item.
- [x] Mark item finished only when both meaning and reading answered, or one side is unavailable/skipped.
- [x] Support practice mode flag that skips progress submission.
- [x] Consume review settings from `settings.ts`: reviewOrder, reviewBatchSize, reviewItemsLimit, groupMeaningReading, meaningFirst, minimizeReviewPenalty, and skipKanjiReadings.
- [x] Consume exact-match settings in review answer checking.
- [x] Load persisted settings into review session instead of hardcoded defaults.
- [x] Add unit tests for review queue state machine in `src/domain/study/`.
- [x] Refactor LessonSessionScreen to use shared components.

### Phase 2: Completion Features

- [x] Add review summary screen with success rate and incorrect items grouped by level.
- [x] Support domain-level wrap-up behavior.
- [x] Add review UI for wrap-up mode.
- [x] Add cheats: override correct, try again later, and add synonym.
- [x] Queue study material synonym updates to `pending_study_materials` for WaniKani API sync.
- [x] Show reading input placeholder in Japanese (答え).

### Phase 3: Polish

- [x] Port iOS `ReviewSession` ordering semantics.
- [x] Support random review order.
- [x] Support ascending, descending, and alternating SRS review order.
- [x] Support current-level-first and lowest-level-first review order.
- [x] Support newest available, oldest available, and longest-relative-wait review order.
- [x] Support Anki mode variants.
- [ ] Add quick settings during review.
- [ ] Add hardware keyboard shortcuts where practical.

## M4: Lesson Flow Parity

- [x] Port iOS lesson selection behavior.
- [x] Apply lesson ordering by radical, kanji, and vocabulary.
- [x] Support current-level priority.
- [x] Support lesson batch size.
- [x] Support apprentice lesson limit.
- [x] Support kana-only vocabulary visibility setting.
- [x] Support vocabulary exclusion setting.
- [x] Add lesson picker grouped by level and subject type.
- [ ] Add subject introduction pages with iOS-like detail sections.
- [ ] Add lesson quiz using the review answer-checking UI.
- [ ] Queue lesson starts after successful lesson quiz completion instead of the current starter-only flow.
- [ ] Add unit tests for lesson selection and filtering.

## M5: Subject Browsing And Search

- [ ] Add subject catalog by level.
- [ ] Add SRS category browsing.
- [ ] Add remaining subjects browsing.
- [ ] Add excluded vocabulary browsing.
- [ ] Add local search by Japanese text, meaning, and kana reading prefixes.
- [ ] Sort exact search matches first, then by level.
- [ ] Limit search results to 50.
- [ ] Add rich subject detail screen with meanings, readings, mnemonics, hints, components, amalgamations, context sentences, stats, and audio.
- [ ] Add synonym editing.
- [ ] Add meaning note editing.
- [ ] Add reading note editing.
- [ ] Queue study material edits offline.
- [ ] Add tests for search ranking and filtering.

## M6: Audio, Fonts, And Appearance

- [ ] Add vocabulary pronunciation playback.
- [ ] Prefer cached audio files when available.
- [ ] Add offline audio download queue.
- [ ] Add voice actor selection.
- [ ] Add autoplay and interrupt-background-audio settings.
- [ ] Add custom Japanese review font support.
- [ ] Add review font-size setting.
- [x] Add light, dark, and system appearance controls in settings.
- [x] Persist and apply appearance changes immediately.

## M7: Notifications, Badges, And Links

- [ ] Add notification permission flow.
- [ ] Schedule local notifications for upcoming review availability.
- [ ] Set badge count where supported.
- [ ] Suppress notifications and badges in vacation mode.
- [ ] Add custom scheme deep links for reviews, lessons, subject IDs, subject text routes, and wrap-up.
- [ ] Add universal/app link configuration where feasible.
- [ ] Add platform support matrix for iOS and Android notification limitations.

## M8: Practice Modes

- [ ] Track recent mistakes for 24 hours.
- [ ] Add recent mistake practice.
- [ ] Add recent lesson practice.
- [ ] Add apprentice leech practice.
- [ ] Add all leech practice with configurable threshold.
- [ ] Add burned item practice.
- [ ] Ensure practice sessions never submit WaniKani SRS progress.
- [ ] Decide whether katakana practice should ship in the cross-platform app.

## M9: Settings Parity

- [x] Add root settings sections for Appearance and Notifications, Lessons, Reviews, Radicals/Kanji/Vocabulary, Diagnostics, and Log Out.
- [ ] Add typed settings migrations.
- [x] Add lesson settings UI (batch size, apprentice limit, prioritize current level, interleave, kana-only vocab).
- [x] Add review settings UI (order, Anki mode, exact match, grouping, cheats, batch size, review limit).
- [ ] Add subject detail settings UI.
- [ ] Add audio settings UI.
- [ ] Add font settings UI.
- [ ] Add diagnostics and sanitized log export UI.

## M10: Beta Hardening

- [ ] Add mocked API integration test suite.
- [ ] Add large-cache performance tests for dashboard, search, and review session startup.
- [ ] Add device QA checklist for Android low-end and mid/high devices.
- [ ] Add device QA checklist for iOS phones and iPads.
- [ ] Test airplane-mode review completion after initial sync.
- [ ] Test force-close during pending sync.
- [ ] Test token invalidation.
- [ ] Test vacation mode.
- [ ] Test WaniKani API rate limiting.
- [ ] Decide whether existing iOS native database migration is required.

## Battery And Background Policy

- [x] Avoid continuous background timers.
- [x] Avoid full sync while entering background.
- [x] Flush pending writes on background only when local pending writes exist.
- [x] Throttle foreground lifecycle sync checks.
- [x] Keep manual pull-to-refresh as the explicit full-sync escape hatch.
- [ ] Add settings/diagnostics copy explaining sync behavior.
- [x] Keep reading keyboard behavior in-app rather than relying on heavyweight background/native services.
- [ ] Add optional background refresh only after explicit user-facing design and platform review.

## Current Known Gaps

- Review sessions have cheats, wrap-up, Anki mode, full ordering, and exact-match support, but still lack quick settings during review and hardware keyboard shortcuts.
- Lessons have ordering, batch size, apprentice limit, interleaving, kana-only filtering, and lesson picker, but still lack subject introduction pages and the full quiz flow. Lesson quiz should reuse the review state machine.
- Dashboard lacks charts and most power-user sections.
- Subject browsing/search/detail screens are not implemented.
- Audio and notifications are scaffold dependencies only, not implemented features.
- Audio, font, and diagnostics settings UI are not yet exposed.

## Feature Reference

### Lesson Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `lessonBatchSize` | number | 5 | Max items per lesson session (1–10). |
| `apprenticeLessonsLimit` | number | MAX_SAFE_INTEGER | Disable lessons when apprentice SRS items exceed this threshold (25–999). |
| `lessonOrder` | SubjectType[] | `['radical','kanji','vocabulary']` | Sort order for subject types within each level. |
| `prioritizeCurrentLevel` | boolean | false | Sort current-level items first (descending level) instead of lower levels first. |
| `interleaveLessons` | boolean | false | Shuffle items within level groups for a mixed subject-type experience. |
| `showKanaOnlyVocab` | boolean | true | Include kana-only vocabulary in lessons and lesson picker. |

### Review Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `reviewOrder` | ReviewOrder | `'random'` | Sort order for review items. Options: random, ascending/descending/alternating SRS, current/lowest level first, newest/oldest available, longest wait. |
| `reviewBatchSize` | number | 5 | Items in the active review queue (1–15). |
| `reviewItemsLimit` | number | 15 | Maximum reviews per session (5–500, step 5). |
| `reviewItemsLimitEnabled` | boolean | false | Whether to cap the review session size. |
| `groupMeaningReading` | boolean | false | Ask meaning and reading back-to-back for each item. |
| `meaningFirst` | boolean | true | Ask meaning before reading when grouped. |
| `showAnswerImmediately` | boolean | true | Immediately reveal the answer in Anki mode. |
| `showFullAnswer` | boolean | false | Show the full correct answer instead of a partial reveal. |
| `exactMatch` | boolean | false | Disable fuzzy matching for meaning answers. |
| `enableCheats` | boolean | true | Allow override correct, try again later, and add synonym. |
| `skipKanjiReadings` | boolean | false | Skip reading prompts for kanji subjects. |
| `minimizeReviewPenalty` | boolean | true | Cap wrong counts to 1 per task type. |
| `ankiMode` | boolean | false | Self-grading mode with answer reveal. |
| `ankiModeTaskType` | AnkiModeTaskType | `'both'` | Which tasks to show in Anki mode: both, reading-only, or meaning-only. |
| `ankiModeCombineReadingMeaning` | boolean | false | Combine reading and meaning into one card in Anki mode. |

### Appearance Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `appearance` | AppearanceMode | `'system'` | Theme: system, light, or dark. Applied immediately and persisted. |

### Other Settings (Defined, Not Yet Wired)

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `notificationsAllReviews` | boolean | false | Notify for all reviews (not just upcoming). |
| `notificationsBadging` | boolean | true | Show badge count for available reviews. |
| `notificationSounds` | boolean | false | Play sound for review notifications. |
| `leechThreshold` | number | 1 | Threshold for leech detection in practice modes. |
| `playAudioAutomatically` | boolean | false | Auto-play vocabulary audio during reviews. |
| `interruptBackgroundAudio` | boolean | false | Interrupt background audio when playing vocabulary. |
| `offlineAudio` | boolean | false | Download vocabulary audio for offline playback. |
| `offlineAudioCellular` | boolean | false | Allow offline audio downloads over cellular. |
