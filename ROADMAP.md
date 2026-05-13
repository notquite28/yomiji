# 読路 (Yomiji) Roadmap

This roadmap tracks 読路 development. `REACT_NATIVE_PORT_PRD.md` contains the original product requirements context.

## Guiding Principles

- [x] Preserve established iOS learning semantics while building Android-native interaction patterns.
- [x] Keep the app offline-first after initial sync.
- [x] Keep background work battery-conscious and user-visible.
- [x] Prefer local cache reads for dashboard, study sessions, search, and subject details.
- [x] Queue local writes transactionally before attempting network sync.
- [x] Avoid logging API tokens, Authorization headers, or sensitive request payloads.

## Current Foundation

- [x] Expo React Native TypeScript app shell in repository root.
- [x] React Navigation native stack with login, dashboard, settings, reviews, lessons, and lesson picker routes.
- [x] WaniKani API token login using `/user` validation.
- [x] Secure API token storage through platform secure storage.
- [x] Local SQLite schema for synced API collections, sync cursors, pending writes, audio URLs, and diagnostics.
- [x] Incremental sync for user, subjects, assignments, study materials, level progressions, voice actors, and review statistics.
- [x] Pending queue sync for review submissions, lesson starts, and study material edits.
- [x] Battery-conscious lifecycle sync: stale foreground sync and pending-write-only background flush.
- [x] Dashboard with username, level, lesson count, review count, SRS bucket counts, sync status, and cache stats.
- [x] Lesson session with configurable ordering, filtering, max session size, per-quiz batch size, and interleaving.
- [x] Lesson picker grouped by level and subject type with multi-select.
- [x] Interactive review flow using cached available review assignments and the two-queue review state machine.
- [x] Initial answer checker port with normalization, kana handling, meanings, synonyms, blacklists, fuzzy matching, other readings, invalid characters, and okurigana detection.
- [x] Android-first reading input with romaji-to-kana conversion.
- [x] CSS-aware image-only radical rendering in reviews, lessons, and diagnostics.
- [x] Long-press help toasts and accessibility labels for ambiguous dashboard/session controls.
- [x] Unit tests for answer checking, review session behavior, radical SVG fallback handling, study queue image selection, error sanitization/classification, and migration validation.

## M0: Architecture Hardening

- [x] Document the SQLite schema mapping versus the original protobuf model.
- [x] Add migration tests for schema creation and future migrations.
- [x] Add sanitized error logging helpers and wire API/sync failures into `error_log`.
- [x] Add a diagnostics screen for app version, sync state, pending queue counts, and sanitized export.
- [x] Add a radical image diagnostics preview for cached image-only radicals.
- [x] Add network-state awareness so sync errors distinguish offline, timeout, auth, and rate-limit states.
- [x] Add a simple local repository layer boundary for subjects, assignments, study materials, and review stats.

## M1: Sync Reliability

- [ ] Add integration tests for WaniKani pagination.
- [ ] Add integration tests for incremental `updated_after` cursors.
- [ ] Add integration tests for pending review progress and lesson starts.
- [ ] Add integration tests for study material create/update flows.
- [x] Handle 401 and 403 by marking the token unauthorized and prompting re-authentication.
- [x] Handle hibernating-account errors with actionable copy.
- [x] Handle 429 rate limiting with retry timing and visible status.
- [x] Preserve pending writes across full refreshes.
- [x] Add a manual full refresh action that clears remote cache data without dropping pending local writes.

## M2: Dashboard Parity

- [x] Match the iOS dashboard information hierarchy more closely.
- [ ] Show WaniKani recommended lessons separately from Advanced lesson pool. *(research complete — see `docs/recommended-lessons-research.md`; algorithm uses proportional type distribution across batches sorted by `lesson_position`, driven by `lessons_batch_size` user preference)*
- [x] Add upcoming reviews chart for next 24 hours.
- [x] Add current-level progress charts for radicals, kanji, and vocabulary.
- [~] Add recent lessons section. *(removed — dashboard now focuses on available work and recent mistakes practice)*
- [x] Add recent mistakes section.
- [x] Add apprentice leeches and all leeches sections.
- [x] Add burned item practice entry point.
- [x] Add excluded items entry point.
- [x] Update dashboard counts immediately after local review and lesson actions.
- [x] Refresh dashboard on hour boundaries while foregrounded without continuous background timers.

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
- [x] Add quick settings during review.
- [x] Add inline subject details after answer feedback with task-aware section hiding.
- [~] Add hardware keyboard shortcuts where practical. *(not planned — tablet-only, low ROI)*

## M4: Lesson Flow Parity

- [x] Port iOS lesson selection behavior.
- [x] Apply lesson ordering by radical, kanji, and vocabulary.
- [x] Support current-level priority.
- [x] Support lesson session size and per-quiz lesson batch size.
- [~] Support apprentice lesson limit. *(removed — WaniKani web does not block lessons by apprentice count)*
- [x] Support kana-only vocabulary visibility setting.
- [x] Support vocabulary exclusion setting.
- [x] Add lesson picker grouped by level and subject type.
- [x] Add subject introduction pages with iOS-like detail sections.
- [x] Add lesson quiz using the review answer-checking UI.
- [x] Queue lesson starts after successful lesson quiz completion instead of the current starter-only flow.
- [x] Add unit tests for lesson selection and filtering.

## M5: Subject Browsing And Search

- [x] Add subject catalog by level.
- [x] Add SRS category browsing.
- [~] Add remaining subjects browsing. *(not planned — individual SRS bucket rows cover the use case without a single heavy query)*
- [x] Add excluded vocabulary browsing.
- [x] Add local search by Japanese text, meaning, and kana reading prefixes.
- [x] Sort exact search matches first, then by level.
- [x] Limit search results to 50.
- [x] Add rich subject detail screen with meanings, readings, mnemonics, hints, components, amalgamations, context sentences, and stats.
- [x] Add synonym editing.
- [x] Add meaning note editing.
- [x] Add reading note editing.
- [x] Queue study material edits offline.
- [x] Add tests for search ranking and filtering.

## M6: Audio, Fonts, And Appearance

- [x] Add vocabulary pronunciation playback.
- [ ] Prefer cached audio files when available.
- [ ] Add offline audio download queue.
- [x] Add voice actor selection.
- [x] Add autoplay and interrupt-background-audio settings.
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

- [x] Track recent mistakes for 24 hours.
- [x] Add recent mistake practice.
- [~] Add recent lesson practice. *(not planned — limited utility given lesson picker and lesson quiz flow)*
- [x] Add apprentice leech practice.
- [x] Add all leech practice with configurable threshold.
- [x] Add burned item practice.
- [x] Ensure practice sessions never submit WaniKani SRS progress.
- [ ] Decide whether katakana practice should ship in the cross-platform app.

## M9: Settings Parity

- [x] Add root settings sections for Appearance, Lessons, Reviews, Diagnostics, and Log Out.
- [ ] Add Notifications settings section.
- [ ] Add Radicals/Kanji/Vocabulary (subject detail) settings section.
- [ ] Add typed settings migrations.
- [x] Add lesson settings UI (new items per quiz, max lessons per session, prioritize current level, interleave, kana-only vocab).
- [x] Add review settings UI (order, Anki mode, exact match, grouping, cheats, batch size, review limit).
- [ ] Add subject detail settings UI.
- [x] Add audio settings UI.
- [ ] Add font settings UI.
- [x] Add diagnostics and sanitized log export UI.

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
- [x] Add settings/diagnostics copy explaining sync behavior.
- [x] Keep reading keyboard behavior in-app rather than relying on heavyweight background/native services.
- [ ] Add optional background refresh only after explicit user-facing design and platform review.

## Current Known Gaps

- Review sessions have cheats, wrap-up, quick settings, Anki mode, full ordering, exact-match support, and inline subject details after answer feedback. Hardware keyboard shortcuts are not planned.
- Lessons have ordering, max session size, per-quiz batch size, interleaving, kana-only filtering, lesson picker, subject introduction pages with detail sections, and a full quiz flow that queues lesson starts on completion.
- Dashboard has upcoming reviews chart, current-level progress, recent mistakes, leeches (with practice buttons), and shortcuts for burned practice and excluded items.
- Dashboard lacks WaniKani recommended lessons vs. advanced lesson pool separation. Algorithm research is complete (see `docs/recommended-lessons-research.md`); implementation pending.
- Subject catalog by level, search, detail screens, SRS bucket browsing, and excluded items browsing are implemented.
- Streaming audio playback and voice actor selection are implemented. Offline audio is not implemented.
- Notifications, badges, and deep links are not implemented.
- Custom font and font-size settings are not implemented.
- Practice modes for recent mistakes, apprentice leeches, all leeches, and burned items are implemented with dashboard entry points. Katakana practice is undecided.
- Settings exposes Appearance, Reviews, Lessons, Audio, Diagnostics, and Log Out. Font, notification, and subject detail settings UI are not yet exposed.

## Feature Reference

### Lesson Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `lessonBatchSize` | number | 5 | New items introduced before each lesson quiz (1–10). |
| `lessonSessionSize` | number | 15 | Max lessons pulled from the dashboard Lessons card (1–50). |
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

### Audio Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `playAudioAutomatically` | boolean | false | Auto-play vocabulary audio during reviews. |
| `interruptBackgroundAudio` | boolean | false | Interrupt background audio when playing vocabulary. |
| `preferredVoiceActorId` | number \| null | null | Preferred voice actor for streamed vocabulary audio; null uses automatic selection. |

### Other Settings (Defined, Not Yet Wired)

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `notificationsAllReviews` | boolean | false | Notify for all reviews (not just upcoming). |
| `notificationsBadging` | boolean | true | Show badge count for available reviews. |
| `notificationSounds` | boolean | false | Play sound for review notifications. |
| `leechThreshold` | number | 1 | Threshold for leech detection in practice modes. |
| `offlineAudio` | boolean | false | Download vocabulary audio for offline playback. |
| `offlineAudioCellular` | boolean | false | Allow offline audio downloads over cellular. |
