# 読路 (Yomiji) Product Requirements (Original Port PRD)

## Document Status

Status: Historical reference — captured at port inception

Source audit date: 2026-05-10

Source app: Tsurukame, an unofficial WaniKani mobile app for iOS

Primary source areas reviewed:

| Area | Files |
| --- | --- |
| Product positioning | `README.md`, `ios/fastlane/metadata/en-AU/description.txt`, `ios/fastlane/screenshots/en-AU/` |
| App shell and dashboard | `ios/AppDelegate.swift`, `ios/MainViewController.swift`, `ios/MainWaniKaniTabViewController.swift` |
| Reviews and lessons | `ios/ReviewSession.swift`, `ios/ReviewViewController.swift`, `ios/LessonsViewController.swift`, `ios/LessonPickerViewController.swift`, `ios/AnswerChecker.swift` |
| Data and sync | `ios/LocalCachingClient.swift`, `ios/WaniKaniAPI/Sources/WaniKaniAPI/APIClient.swift`, `proto/wanikani_api.proto` |
| Content browsing | `ios/SubjectCatalogueViewController.swift`, `ios/SubjectsByLevelViewController.swift`, `ios/SubjectsByCategoryViewController.swift`, `ios/SubjectDetailsView.swift`, `ios/SearchResultViewController.swift` |
| Settings and platform features | `ios/Settings.swift`, `ios/SettingsViewController.swift`, `ios/AppSettingsViewController.swift`, `ios/ReviewSettingsViewController.swift`, `ios/LessonSettingsViewController.swift`, `ios/SubjectDetailsSettingsViewController.swift`, `ios/Audio.swift`, `ios/OfflineAudio.swift`, `ios/FontLoader.swift`, `www/README.md` |

## Summary

Port Tsurukame from native iOS Swift/UIKit to React Native as an offline-first mobile WaniKani client. The React Native app should preserve the current iOS app's core learning value: fast local access to WaniKani study content, offline-capable reviews and lessons, rich subject detail pages, review customization, notifications for upcoming reviews, and power-user workflows such as recent mistakes, leeches, burned-item practice, synonyms, and configurable review order.

The recommended first release should target functional parity for iOS and Android phones. iPad/tablet responsiveness should be included where feasible through adaptive layouts. Apple Watch complications, Siri shortcuts, and iCloud recent-mistake sync should be treated as post-MVP platform parity unless iOS-only parity is a hard launch requirement.

## Problem

Tsurukame is currently an iOS-only native app. WaniKani users who want the Tsurukame experience on Android or in a shared cross-platform codebase cannot use or extend the current Swift/UIKit implementation. The existing app also contains significant product logic in platform-specific code, including answer checking, local sync, offline progress, review session ordering, charts, notifications, audio caching, custom fonts, and subject browsing.

## Goals

1. Deliver a React Native mobile app that lets WaniKani users complete lessons and reviews with the same learning semantics as the existing app.
2. Preserve offline-first behavior: users can review, complete lessons, edit study materials, and play cached audio while offline, with progress syncing later.
3. Support both iOS and Android with a shared TypeScript domain layer for API, sync, answer checking, review sessions, and settings.
4. Maintain Tsurukame's speed by caching WaniKani content locally and avoiding network dependency for normal navigation and study sessions.
5. Preserve the main power-user settings and workflows that differentiate the app from a basic WaniKani wrapper.
6. Reduce platform-specific logic to native modules only where necessary, such as notifications, badge counts, background fetch, secure token storage, audio, and deep links.

## Non-Goals

1. Do not build a WaniKani replacement or independent SRS service.
2. Do not alter WaniKani SRS rules beyond user-configurable review ordering, typo handling, Anki mode, and existing local practice modes.
3. Do not scrape or redistribute WaniKani content outside the logged-in user's API-authorized app cache.
4. Do not require a backend service for MVP.
5. Do not require full Apple Watch, Siri shortcut, iCloud KVS, or App Store screenshot automation parity for MVP.
6. Do not migrate existing native iOS local databases in MVP unless this is required for existing Tsurukame users to upgrade in place.

## Target Users

| User | Need |
| --- | --- |
| Active WaniKani learner | Complete daily reviews and lessons quickly on mobile. |
| Offline learner | Study during travel or unreliable connectivity and sync later. |
| Power user | Configure review order, batch size, typo tolerance, audio, fonts, and lesson ordering. |
| Catch-up user | Review recent mistakes, recent lessons, leeches, apprentice items, and burned items. |
| Content browser | Search and inspect WaniKani radicals, kanji, and vocabulary with mnemonics, readings, context sentences, and progress stats. |
| Android WaniKani user | Use Tsurukame-like workflows on Android for the first time. |

## Product Principles

1. Offline first: every core learning path should work from the local cache once initial sync is complete.
2. Fast first: dashboard, search, subject details, and study sessions should load from local data without blocking on the network.
3. Trustworthy sync: the app must never silently lose review, lesson, synonym, or note progress.
4. WaniKani semantics: answer marking and progress submission must match WaniKani API expectations.
5. Native mobile feel: the app should feel at home on both iOS and Android, not like an embedded website.
6. Power-user respectful: preserve the settings that affect established user workflows.

## Launch Scope

### MVP

1. API-token authentication and logout.
2. Initial and incremental WaniKani API sync for user, assignments, subjects, study materials, level progressions, voice actors, and review statistics.
3. Local SQLite cache and pending mutation queues for offline review progress, lesson starts, study material edits, synonyms, and exclusion state.
4. Dashboard with available lessons/reviews, upcoming reviews chart, current-level progress, all-level SRS categories, recent lessons, recent mistakes, leeches, burned items, and excluded items.
5. Review sessions with answer checking, meaning/reading task selection, configurable ordering, batching, wrapping up, skip/cheat actions, Anki mode, summary, audio, and local progress submission.
6. Lesson flow with subject introduction pages, lesson quiz, lesson picker, lesson ordering, batch size, current-level priority, apprentice limit, kana-only vocabulary setting, and vocabulary exclusion setting.
7. Practice flows for recent lessons, recent mistakes, apprentice leeches, all leeches, and burned items.
8. Subject catalog, SRS-category browsing, remaining/all subject lists, search, and subject detail screens.
9. Settings for appearance, notifications, lessons, reviews, subject details, audio, fonts, and logout.
10. Local notifications and badge counts for upcoming reviews on both iOS and Android where supported.
11. Deep links for reviews, lessons, subject IDs, subject text routes, and wrap-up.
12. Offline audio cache and vocabulary audio playback.
13. Light, dark, and system appearance modes.
14. Basic crash/error logging without storing API tokens or Authorization headers.

### Post-MVP

1. Email/password login that creates or retrieves a WaniKani API token through web session automation. This is brittle and should be revisited for compliance and maintenance risk.
2. Apple Watch complications and WatchConnectivity.
3. Siri shortcuts and Android app shortcuts.
4. iCloud recent-mistake sync or a cross-platform equivalent.
5. Existing native iOS database migration for direct upgrades from the Swift app.
6. Full iPad/tablet optimized layouts beyond responsive phone/tablet scaling.
7. App Store screenshot automation parity.
8. Developer-only features such as dumping subject textproto and showing all levels for unsubscribed users.

## Key User Journeys

### First Run and Sync

1. User opens the app and chooses API token login.
2. User enters or pastes a WaniKani API token.
3. App validates the token with `/user`.
4. App securely stores the token in Keychain or Android Keystore backed secure storage.
5. App performs initial sync and shows sync progress.
6. App opens the dashboard when usable local data exists.

Acceptance criteria:

1. Invalid, expired, unauthorized, or hibernating-account states show actionable errors.
2. Token permission errors explain required WaniKani permissions: `assignments:start`, `reviews:create`, `study_materials:create`, and `study_materials:update`.
3. Initial sync can resume after app restart or network interruption without corrupting local data.

### Dashboard Study Loop

1. User sees available lessons and reviews.
2. User starts reviews when reviews are available.
3. User returns to the dashboard after the summary.
4. Dashboard updates local counts immediately and sync status in the background.
5. User can pull to refresh for a full sync.

Acceptance criteria:

1. Lessons are disabled when the apprentice lesson limit is reached.
2. Vacation mode hides active study availability and clears notifications/badges.
3. Upcoming review and current-level charts render from local cache.
4. Dashboard updates on hour boundaries while foregrounded.

### Review Session

1. User starts reviews from available review-stage assignments.
2. App sorts and optionally limits the review item set based on settings.
3. App asks meaning and reading tasks based on subject data and review settings.
4. User answers using text input or Anki mode.
5. App marks exact, imprecise, invalid, other-reading, okurigana mismatch, and incorrect answers.
6. User can reveal answers, add synonyms, override incorrect answers, ask again later, exclude vocabulary, skip when enabled, wrap up, or end the session.
7. Completed review progress is saved locally and submitted to WaniKani when online.
8. User sees a review summary with correct percentage and incorrect items grouped by level.

Acceptance criteria:

1. Meaning and reading wrong counts match the existing Swift semantics.
2. Incorrect answers stay in the active session and return later unless grouped mode or practice mode requires immediate back-to-back behavior.
3. Practice sessions never submit WaniKani progress.
4. Minimized review penalty caps wrong counts to one per wrong task type when enabled.
5. Wrap-up stops adding new backlog items and finishes only active attempted items.

### Lesson Session

1. User starts lessons or opens the lesson picker.
2. App selects lesson-stage assignments, applies lesson ordering and batch size, and honors apprentice limit and kana-only vocabulary settings.
3. User reviews subject detail pages.
4. User completes a quiz using the review UI.
5. App queues assignment start progress locally and syncs it to WaniKani.

Acceptance criteria:

1. Lesson ordering supports radical, kanji, vocabulary ordering and current-level priority.
2. Lesson picker groups available lesson subjects by level and type.
3. Lesson quiz hides review-only UI such as history, menu, and success rate.

### Subject Browsing and Search

1. User browses subjects by level, SRS category, remaining items, excluded items, or search.
2. App displays radicals, kanji, and vocabulary using WaniKani colors and progress state.
3. User opens a subject detail page.
4. User can inspect meanings, readings, mnemonics, hints, components, amalgamations, similar kanji, context sentences, notes, synonyms, stats, artwork, and audio.

Acceptance criteria:

1. Search runs locally, supports Japanese, meaning, and kana reading prefixes, returns exact matches first, sorts by level, and limits to 50 results.
2. Subject detail hides unanswered sections during review context until the user reveals more information.
3. Subject detail supports editing meaning synonyms, meaning notes, and reading notes through queued study material updates.

## Functional Requirements

### Authentication

| ID | Requirement | Priority |
| --- | --- | --- |
| AUTH-1 | Support WaniKani API token login. | P0 |
| AUTH-2 | Validate tokens using `/user` before entering the app. | P0 |
| AUTH-3 | Store tokens in secure platform storage, not AsyncStorage or plain preferences. | P0 |
| AUTH-4 | Support logout that clears token, local cache, pending writes, cached audio, cached fonts if desired, and returns to login. | P0 |
| AUTH-5 | Show a token-management link for invalid tokens. | P1 |
| AUTH-6 | Support email/password web-login token provisioning only if explicitly approved after compliance review. | P3 |

### WaniKani API Client

| ID | Requirement | Priority |
| --- | --- | --- |
| API-1 | Use WaniKani API v2 with `Authorization: Token token=<apiToken>`. | P0 |
| API-2 | Fetch `/user`, `/assignments`, `/study_materials`, `/level_progressions`, `/subjects`, `/voice_actors`, and `/review_statistics`. | P0 |
| API-3 | Submit `PUT /assignments/{id}/start` for lessons. | P0 |
| API-4 | Submit `POST /reviews` for reviews. | P0 |
| API-5 | Create and update study materials with `POST /study_materials` and `PUT /study_materials/{id}`. | P0 |
| API-6 | Support WaniKani pagination and `updated_after` incremental sync. | P0 |
| API-7 | Track WaniKani rate limit behavior, currently assumed as 60 requests per server-clock minute in the Swift app. | P0 |
| API-8 | Avoid logging request headers, tokens, or sensitive request data. | P0 |
| API-9 | Handle 401/403 authorization failures, 422 invalid pending progress, 429 rate limiting, offline state, malformed responses, and hibernating-account errors. | P0 |

### Local Data and Sync

| ID | Requirement | Priority |
| --- | --- | --- |
| DATA-1 | Store local data in SQLite. | P0 |
| DATA-2 | Store subjects, assignments, user, study materials, level progressions, voice actors, review statistics, audio URLs, subject progress, recent mistakes, sync cursors, pending progress, and pending study materials. | P0 |
| DATA-3 | Preserve current protobuf schema concepts from `proto/wanikani_api.proto`, either through generated TypeScript protobufs or a documented relational/JSON schema mapping. | P0 |
| DATA-4 | Send pending progress and study materials before fetching remote updates. | P0 |
| DATA-5 | Fetch subjects before assignments during sync so assignment level/type derivation is reliable. | P0 |
| DATA-6 | Prevent concurrent sync runs. | P0 |
| DATA-7 | Full refresh clears cached API data and sync cursors but preserves pending local writes until safely sent or dropped. | P0 |
| DATA-8 | Treat 422 responses for pending progress as obsolete or invalid and drop them only with diagnostic logging. | P1 |
| DATA-9 | Keep recent mistakes for 24 hours and merge newer timestamps when cross-device sync exists. | P1 |
| DATA-10 | Support exportable diagnostics database or sanitized logs. | P2 |

### Dashboard

| ID | Requirement | Priority |
| --- | --- | --- |
| DASH-1 | Show user header with username, WaniKani level, guru kanji count, profile image or Gravatar, and vacation banner. | P0 |
| DASH-2 | Show lessons, lesson picker, and reviews in a currently available section. | P0 |
| DASH-3 | Show upcoming review chart for at least the first 48 hours. | P0 |
| DASH-4 | Show current-level progress charts for radicals, kanji, and vocabulary with locked, lesson, apprentice, and guru state slices. | P0 |
| DASH-5 | Show estimated level-up time and next level-up review timing. | P1 |
| DASH-6 | Show previous-level graph until completed when enabled. | P1 |
| DASH-7 | Show SRS category counts for apprentice, guru, master, enlightened, and burned. | P0 |
| DASH-8 | Show recent lessons, recent mistakes, apprentice leeches, all leeches, burned-item practice, and excluded items when applicable. | P0 |
| DASH-9 | Support pull-to-refresh full sync and quick foreground refresh. | P0 |
| DASH-10 | Respect vacation mode by suppressing active review/lesson actions and notifications. | P0 |

### Reviews

| ID | Requirement | Priority |
| --- | --- | --- |
| REV-1 | Build review item sets from non-excluded assignments available for review. | P0 |
| REV-2 | Support review order settings: random, ascending SRS, descending SRS, alternating SRS, current level first, lowest level first, newest available first, oldest available first, and longest relative wait. | P0 |
| REV-3 | Support review item limit and review batch size. | P0 |
| REV-4 | Support grouped meaning/reading and configurable meaning-first behavior. | P0 |
| REV-5 | Support Anki mode for both, reading-only, meaning-only, and combined reading/meaning. | P1 |
| REV-6 | Support skipping kanji readings when enabled. | P1 |
| REV-7 | Support quick settings during review for display, answers, audio, wrap-up, and end session. | P0 |
| REV-8 | Support cheats: override as correct, ask again later, add synonym, and exclude vocabulary where allowed. | P0 |
| REV-9 | Support answer reveal, full-answer reveal, exact-match mode, allow skipping, and minimized penalty. | P0 |
| REV-10 | Play vocabulary audio manually and automatically based on settings. | P0 |
| REV-11 | Save completed review progress locally immediately. | P0 |
| REV-12 | Show summary with success rate and incorrect items grouped by level. | P0 |
| REV-13 | Support keyboard shortcuts on hardware keyboards where practical. | P2 |

### Answer Checking

| ID | Requirement | Priority |
| --- | --- | --- |
| AC-1 | Normalize answers by trimming whitespace, lowercasing, replacing hyphens with spaces, and removing `.`, `'`, and `/`. | P0 |
| AC-2 | For readings, convert `n` and full-width `ｎ` to kana and remove spaces. | P0 |
| AC-3 | Reject non-kana characters in reading answers and Japanese characters in meaning answers. | P0 |
| AC-4 | Accept primary readings and accepted meanings. | P0 |
| AC-5 | Accept meaning synonyms from study materials. | P0 |
| AC-6 | Reject blacklisted meanings before fuzzy matching. | P0 |
| AC-7 | Detect imprecise meaning answers using Levenshtein tolerance. | P0 |
| AC-8 | Detect other kanji readings and single-kanji vocabulary kanji-reading mistakes. | P0 |
| AC-9 | Detect mismatching okurigana and highlight ranges. | P1 |
| AC-10 | Detect when a meaning answer is actually a reading and prompt accordingly. | P1 |

### Lessons

| ID | Requirement | Priority |
| --- | --- | --- |
| LES-1 | Build lessons from lesson-stage assignments. | P0 |
| LES-2 | Apply lesson order, current-level priority, lesson batch size, apprentice limit, kana-only vocabulary visibility, and vocabulary exclusion settings. | P0 |
| LES-3 | Provide a lesson picker grouped by level and subject type. | P0 |
| LES-4 | Provide subject introduction pages before the quiz. | P0 |
| LES-5 | Reuse the review answer-checking flow for the quiz. | P0 |
| LES-6 | Queue lesson-start progress locally and sync via assignments start endpoint. | P0 |

### Practice Modes

| ID | Requirement | Priority |
| --- | --- | --- |
| PRACT-1 | Support recent lesson practice. | P0 |
| PRACT-2 | Support recent mistake practice using 24-hour mistake retention. | P0 |
| PRACT-3 | Support apprentice leech practice. | P0 |
| PRACT-4 | Support all leech practice using configurable leech threshold. | P0 |
| PRACT-5 | Support burned-item practice. | P0 |
| PRACT-6 | Ensure practice sessions never submit WaniKani SRS progress. | P0 |
| PRACT-7 | Support katakana character practice if the practice tab is retained. | P2 |

### Subject Browsing and Details

| ID | Requirement | Priority |
| --- | --- | --- |
| SUBJ-1 | Browse by level with radicals, kanji, and vocabulary sections. | P0 |
| SUBJ-2 | Browse by SRS category with sections by subject type and stage. | P0 |
| SUBJ-3 | Browse remaining subjects for current or previous level. | P0 |
| SUBJ-4 | Browse excluded vocabulary when exclusion is enabled. | P1 |
| SUBJ-5 | Support show/hide answers toggle in subject catalog views. | P1 |
| SUBJ-6 | Search all subjects locally by Japanese text, meanings, and kana readings. | P0 |
| SUBJ-7 | Show subject details with meanings, readings, audio, components, amalgamations, mnemonics, explanations, hints, notes, context sentences, parts of speech, similar kanji, SRS stats, artwork, and exclusion controls. | P0 |
| SUBJ-8 | Support subject detail editing for synonyms, meaning notes, and reading notes. | P0 |
| SUBJ-9 | Respect settings for katakana onyomi, all readings, stats, old mnemonics, blurred context sentences, artwork, similar kanji above current level, and show full answer. | P1 |

### Audio and Fonts

| ID | Requirement | Priority |
| --- | --- | --- |
| AF-1 | Play vocabulary pronunciation audio from cached file when available or remote URL when online. | P0 |
| AF-2 | Support offline audio downloads by selected voice actors. | P1 |
| AF-3 | Support offline audio over cellular setting. | P1 |
| AF-4 | Cycle through available vocabulary audio pronunciations. | P1 |
| AF-5 | Support autoplay and interrupt-background-audio settings. | P0 |
| AF-6 | Include or download current custom Japanese review fonts from `www/fonts`. | P1 |
| AF-7 | Allow users to select multiple fonts and randomly apply selected fonts during review. | P1 |
| AF-8 | Support review font-size scaling. | P0 |

### Notifications, Badges, and Deep Links

| ID | Requirement | Priority |
| --- | --- | --- |
| PLATFORM-1 | Support notification settings for all reviews, app badging, and notification sound. | P0 |
| PLATFORM-2 | Schedule hourly local notifications for upcoming review count changes up to platform limits. | P0 |
| PLATFORM-3 | Set app badge count to available reviews where supported. | P0 |
| PLATFORM-4 | Clear badges and avoid review notifications in vacation mode. | P0 |
| PLATFORM-5 | Support background fetch or background sync where supported. | P1 |
| PLATFORM-6 | Support universal links and custom scheme paths for `/reviews`, `/lessons`, `/subject/{id}`, `/radical/{text}`, `/kanji/{text}`, `/vocabulary/{text}`, and `/wrap-up`. | P0 |
| PLATFORM-7 | Preserve hosted `tsurukame.app` links and font hosting if the same domain remains in use. | P1 |

### Settings

| ID | Requirement | Priority |
| --- | --- | --- |
| SET-1 | Provide root settings sections for Appearance and Notifications, Lessons, Reviews, Radicals/Kanji/Vocabulary, Diagnostics, and Log Out. | P0 |
| SET-2 | Persist settings locally and apply changes immediately where possible. | P0 |
| SET-3 | Support light, dark, and system appearance. | P0 |
| SET-4 | Support notification permission flows and platform-specific disabled states. | P0 |
| SET-5 | Support diagnostics actions for app version, sanitized local DB export, clearing avatar cache, and error log review/export. | P2 |

## UX Requirements

1. Use a native stack navigation model with modal search and settings/detail stacks.
2. Preserve the WaniKani color palette: radicals blue, kanji pink, vocabulary purple, locked grey, and distinct SRS category colors.
3. Preserve dashboard information hierarchy from the existing iOS app.
4. Render charts legibly on small phones and tablets.
5. Support dynamic type or equivalent font scaling for core UI while preserving large Japanese prompt readability.
6. Support Japanese input without disrupting external keyboards.
7. Support light/dark/system theme across all screens.
8. Do not block the user from browsing cached data while sync is running.
9. Clearly show offline, syncing, unauthorized, rate-limited, and hibernating states.
10. Keep review input and feedback interactions low latency.

## Technical Approach

### Recommended Stack

| Concern | Recommendation |
| --- | --- |
| App framework | React Native with TypeScript |
| Navigation | React Navigation native stack and modal routes |
| Local DB | SQLite through a maintained React Native SQLite binding |
| Secure token storage | Keychain on iOS and Keystore-backed storage on Android |
| State management | Query/cache layer for UI reads plus explicit domain services for sync/session logic |
| Protobuf | Generate TypeScript bindings from `proto/wanikani_api.proto` or replace with a documented schema mapping |
| Charts | React Native chart/SVG implementation capable of stacked bars, cumulative lines, and pie charts |
| Audio | Native-backed audio playback with file cache support |
| Notifications | Platform notification library supporting local scheduling and badges |
| Background work | iOS background fetch and Android WorkManager equivalent where feasible |
| Deep links | React Navigation linking plus native associated domains/app links configuration |

### Domain Modules

1. `api`: WaniKani REST client, pagination, auth, rate limiting, response parsing, error mapping.
2. `db`: migrations, DAO layer, transactions, query helpers.
3. `sync`: pending mutation processing, incremental sync, full refresh, concurrency guard, progress reporting.
4. `reviews`: review item construction, ordering, session state machine, progress generation.
5. `answers`: normalization, kana conversion, answer checking, Levenshtein tolerance, okurigana detection.
6. `lessons`: lesson selection, lesson picker grouping, lesson quiz handoff.
7. `subjects`: search, catalog grouping, detail data assembly, similar kanji filtering.
8. `settings`: typed settings schema, defaults, persistence, migrations.
9. `notifications`: upcoming-review schedule generation, badges, vacation suppression.
10. `audio`: remote/cached playback, offline download queue, voice actor selection.

### Data Model Guidance

The Swift app stores protobuf blobs in SQLite and keeps searchable/indexed columns for common access patterns. The React Native port can either keep protobuf blobs for close parity or use JSON/relational storage. The MVP must document and test whichever mapping is chosen.

Minimum tables or stores:

| Store | Key data |
| --- | --- |
| `sync` | `assignments_updated_after`, `study_materials_updated_after`, `subjects_updated_after`, `voice_actors_updated_after`, `review_stats_updated_after` |
| `subjects` | ID, Japanese text, level, type, full subject payload |
| `assignments` | ID, subject ID, level, subject type, SRS stage, availability, payload |
| `study_materials` | ID, subject ID, notes, synonyms, hidden/excluded state if represented locally |
| `pending_progress` | Queued lesson starts and review submissions |
| `pending_study_materials` | Queued study material subject IDs or full payloads |
| `subject_progress` | Subject ID, level, SRS stage, subject type, last mistake time |
| `user` | Current WaniKani user payload |
| `level_progressions` | Level progression payloads |
| `voice_actors` | Voice actor payloads |
| `review_stats` | Review statistic payloads |
| `audio_urls` | Subject ID, voice actor ID, level, remote URL, local file path/status |
| `error_log` | Sanitized diagnostics only |

## Metrics

| Metric | Target |
| --- | --- |
| Crash-free sessions | At least 99.5 percent during beta |
| Review answer latency | UI feedback in under 100 ms for cached sessions on target devices |
| Dashboard cached load | Under 1 second after local DB is initialized |
| Sync reliability | No known silent progress loss; pending queues survive restart |
| Offline completion | Reviews, lessons, subject details, search, and cached audio work with airplane mode after initial sync |
| API correctness | Review/lesson submissions match WaniKani API expectations in integration tests |
| Android parity | MVP feature checklist passes on at least one current low-end and one current mid/high Android device |

## Milestones

| Milestone | Deliverables |
| --- | --- |
| M0: Architecture spike | RN app shell, SQLite proof of concept, secure token storage, WaniKani API client, generated or mapped schema decision |
| M1: Sync foundation | Login, initial sync, incremental sync, pending queues, sanitized error handling, offline/online state |
| M2: Dashboard | Main dashboard, charts, counts, pull-to-refresh, vacation mode, SRS category lists |
| M3: Reviews | Review session state machine, answer checking, progress queue, summary, quick settings, audio playback |
| M4: Lessons and practice | Lesson intro/quiz, lesson picker, practice modes, leech/recent mistake behavior |
| M5: Content browsing | Catalog, SRS lists, remaining/excluded lists, search, subject details, notes/synonyms |
| M6: Settings and platform | Settings parity, notifications, badges, deep links, offline audio, fonts, appearance |
| M7: Beta hardening | Integration tests, device QA, performance tuning, migration decision, app store/play store assets |

## Testing Requirements

1. Unit tests for answer checking using current Swift test cases as source material from `ios/Tests/AnswerCheckerTest.swift`.
2. Unit tests for review session ordering, grouping, wrapping up, wrong counts, Anki mode, practice sessions, and minimized penalty.
3. Unit tests for lesson selection, lesson ordering, apprentice limit, and kana-only vocabulary filtering.
4. Unit tests for search ranking and filtering.
5. Integration tests against mocked WaniKani API pagination, incremental sync, pending progress, study material updates, 401/403/422/429 errors, and offline recovery.
6. Migration or schema tests for SQLite migrations.
7. Device tests for iOS and Android notifications, badges, background fetch, deep links, audio, secure storage, and large local databases.
8. Manual QA scenarios for airplane mode review completion, force-close during pending sync, token invalidation, hibernating account, vacation mode, and rate limiting.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| WaniKani API semantics drift | Incorrect reviews or sync failures | Centralize API client, add integration tests and diagnostics |
| Offline progress loss | High user trust damage | Transactional pending queues, startup recovery tests, no destructive full sync of pending writes |
| Web-login token creation brittleness | Login failures and compliance risk | MVP API-token only; revisit after explicit review |
| React Native SQLite performance | Slow dashboard/search | Add indexes, paginate UI lists, benchmark with full WaniKani dataset |
| Platform notification differences | Inconsistent badge/alert behavior | Define per-platform support matrix and degrade gracefully |
| Existing Swift logic parity gaps | Regressions for power users | Port domain logic with unit tests based on Swift behavior |
| Content licensing and terms | Store rejection or terms violation | Keep content user-authenticated and cached locally only; include WaniKani terms attribution |
| Secret leakage in logs | Account security issue | Redact Authorization headers and sensitive request data by default |

## Open Questions

1. Should MVP be a new cross-platform app or an in-place replacement for the existing iOS app bundle?
2. Is Android parity the primary reason for the React Native port, or is shared-code maintainability the main driver?
3. Is API-token-only login acceptable for MVP?
4. Should the React Native app preserve local database compatibility with the Swift app for existing iOS users?
5. Which post-MVP platform features are launch blockers: Apple Watch, Siri shortcuts, iCloud recent mistakes, tablet layouts, or screenshot automation?
6. Should custom font files remain hosted on `tsurukame.app`, bundled in the app, or both?
7. Should practice modes hidden behind current compile-time flags become user-visible on both platforms?

## Appendix: Existing App Feature Inventory

1. Native iOS WaniKani app with offline reviews and lessons.
2. WaniKani API token authentication plus existing email/password web login.
3. SQLite local cache using protobuf payloads.
4. Incremental sync with `updated_after` cursors.
5. Pending offline review, lesson, and study material queues.
6. Dashboard with available items, upcoming review chart, current-level charts, SRS counts, leeches, recent mistakes, burned items, and excluded items.
7. Review sessions with configurable ordering, batching, grouping, wrap-up, Anki mode, typo tolerance, exact match, cheats, synonyms, skip, audio, and summary.
8. Lesson sessions with intro pages, quiz, picker, ordering, batch size, apprentice limit, and kana-only vocabulary setting.
9. Practice sessions for recent lessons, recent mistakes, leeches, apprentice items, burned items, and katakana practice.
10. Subject catalog by level, SRS-category browsing, remaining/excluded browsing, local search, and rich subject detail pages.
11. Custom fonts and Japanese font-size settings.
12. Offline vocabulary audio with voice actor selection.
13. Local notifications, app badge, background fetch, universal links, custom URL scheme, Siri shortcuts, and Apple Watch complication data.
