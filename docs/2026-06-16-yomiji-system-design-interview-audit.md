# Yomiji System Design Interview Audit

Evidence source: repository files only. If a feature is not evidenced by source/config/docs, it is marked as not found.

## Step 1: Repository Summary

Yomiji is a single-package Expo/React Native TypeScript mobile app for studying WaniKani content offline-first. It has no project-owned backend service in the codebase; the app talks directly to the external WaniKani v2 REST API, syncs remote data into local SQLite, and treats SQLite as the source of truth after login.

| Area | Evidence-based finding |
| --- | --- |
| Main purpose | Cross-platform WaniKani study app for Android/iOS. README.md:3, README.md:17-20. |
| Tech stack | Expo 55, React 19, React Native 0.83, TypeScript, React Navigation, NativeWind/Tailwind, Zustand, Expo SQLite/SecureStore/Notifications/Audio/Updates. package.json, app.json, README.md:237-260. |
| Entry points | package.json `main: expo/AppEntry.js`; real app root is `App.tsx`; navigation/auth root is `src/navigation/AppNavigator.tsx`. |
| Frontend framework | React Native via Expo, NativeWind for most styling. `App.tsx`, `tailwind.config.js`, `global.css`, README.md:142-146. |
| Backend framework | None found. PRD explicitly says MVP should not require a backend service. `REACT_NATIVE_PORT_PRD.md`; package.json has no server framework. |
| API routes | No internal API routes. External API boundary is `src/domain/api/WaniKaniClient.ts` with WaniKani methods including user, subjects, assignments, study materials, level progressions, voice actors, review statistics, assignment start, review creation, and study material upsert. |
| Database/storage | Local SQLite schema in `src/domain/db/schema.ts`; DB helpers in `src/domain/db/database.ts`; SecureStore token in `src/domain/storage/secureToken.ts`; AsyncStorage settings in `src/domain/settings/settings.ts`. |
| Auth system | User supplies WaniKani API token; `LoginScreen` validates with `WaniKaniClient.getUser`; token stored in SecureStore; 401/403 clear token through auth error paths. |
| External APIs | WaniKani v2 REST API; remote radical image/audio assets from WaniKani payloads; Expo native APIs for storage, SQLite, notifications, audio. |
| AI/LLM | Not implemented in app code. `deep-research-report.md` has LLM prompt templates as documentation/tooling context only. |
| Background jobs/workers | No server workers. Client lifecycle sync in `AppNavigator`; local notification scheduling in `notificationService`; pending writes flushed on foreground/background paths. |
| Realtime features | No WebSockets/SSE/realtime collaboration found. There is local state sync and debounced local search. |
| Caching | SQLite remote cache, sync cursors, pending write queues, audio URL table, local settings store hydration. |
| Deployment | Android release workflow in `.github/workflows/android-release.yml`; EAS profiles in `eas.json`; signing in `android/app/build.gradle`; iOS config exists in app.json but release automation found is Android-only. |
| Env/secrets | Release secrets: `EXPO_TOKEN`, `YOMIJI_KEYSTORE_BASE64`, `YOMIJI_KEYSTORE_PASSWORD`; Gradle reads `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. No app runtime `.env`/`EXPO_PUBLIC_*` source usage found. |
| Tests | Jest + ts-jest, strict TypeScript. Domain/unit/integration tests for DB, sync, pending writes, notifications, answer checking, review session, settings, API client. No UI/E2E/coverage config found. |
| Logging/monitoring | Local sanitized `error_log` table and diagnostics UI. No Sentry/Crashlytics/external telemetry SDK found. |
| README claims | Mostly aligned with implementation; explicit README gaps include offline audio downloads, deep-link route parsing/universal links, custom fonts/font size, recommended-lessons split. |

## Step 2: Claim Audit

| Claim | Classification | What is implemented | Safer phrasing | Do not overclaim | Production-grade version |
| --- | --- | --- | --- | --- | --- |
| Cross-platform WaniKani study app | Fully supported by code | Expo/React Native app config for iOS/Android; screens for dashboard/reviews/lessons/search/settings. | “A React Native/Expo WaniKani client targeting Android and iOS.” | Do not claim App Store/Play Store production usage unless outside repo evidence exists. | Store release process, crash analytics, device matrix QA. |
| Offline-first local SQLite cache | Fully supported by code | `schema.ts`, `database.ts`, repositories, sync cursors, pending queues. | “After login/sync, study flows read local SQLite first.” | Do not claim all assets are offline; audio downloads are missing. | Asset prefetch/download manager, cache eviction, migration observability. |
| Incremental sync using WaniKani cursors | Fully supported by code | `syncService.ts`, `sync_cursors`, `WaniKaniClient` collection fetching with `updated_after`. | “Incremental client-side sync with per-collection cursors.” | Do not claim server-side fanout or distributed sync. | Server mediator or queue if API usage needs central throttling. |
| Pending-write queues | Fully supported by code | `pending_progress`, `pending_study_materials`, `runPendingSync`, pending write integration tests. | “Local write-ahead queues flush progress/material edits when online.” | Do not claim exactly-once guarantees; WaniKani API semantics determine remote idempotency. | Idempotency keys, conflict UI, durable retry policy with backoff metadata. |
| Secure token storage | Fully supported by code | `secureToken.ts` uses Expo SecureStore; login/logout paths save/delete. | “Token is stored with platform secure storage.” | Do not claim OAuth, refresh tokens, or server-side sessions. | OAuth/token broker, scoped token validation, device attestation. |
| Auth error clears token | Fully supported by code | `isSyncAuthError`, AppNavigator/Dashboard/Diagnostics logout paths, README claim. | “401/403 force re-authentication.” | Do not claim proactive permission introspection beyond `/user` validation. | Token scope checks, revocation detection, richer auth diagnostics. |
| Network-state and categorized errors | Fully supported by code | `errorLog.ts` classifies offline/timeout/auth/rate-limit/server/hibernating/unknown; UI displays sync errors. | “Sync failures are categorized and sanitized locally.” | Do not claim centralized production monitoring. | External telemetry with PII redaction and alerting. |
| Local notifications | Fully supported by code | `notificationService.ts`, Expo notifications plugin, tests for threshold/daily/badge/vacation. | “Client schedules local review reminders from local DB state.” | Do not claim server push notifications. | Push notification service, timezone/device reconciliation, delivery metrics. |
| Streamed vocabulary audio | Fully supported by code | `vocabularyAudio.ts`, audio URL table, README states streamed playback. | “Audio is streamed from WaniKani-provided URLs when online.” | Do not claim offline audio. | Download queue, storage budget, license/cache invalidation. |
| Working review/lesson flows | Fully supported by code | `ReviewSessionScreen`, `LessonSessionScreen`, `reviewSession.ts`, `studyRepository.ts`, tests. | “Core review/lesson flows are implemented with local queues.” | Do not claim complete Tsurukame parity; README lists gaps. | E2E tests, accessibility pass, performance profiling. |
| Practice modes do not submit SRS | Fully supported by code | `studyRepository` queues sources; `reviewSession` practice mode tested; README. | “Practice reuses review UI but does not submit WaniKani progress.” | Do not claim adaptive ML recommendations. | Recommendation/ranking service, spaced practice analytics. |
| NativeWind migration | Fully supported by code | `tailwind.config.js`, `global.css`, NativeWind Metro/Babel, README notes inline exceptions. | “Most styling uses NativeWind with dynamic inline styles where needed.” | Do not claim zero inline styles. | Design system tokens, visual regression testing. |
| Android release CI | Fully supported by code | `.github/workflows/android-release.yml`, `eas.json`, Gradle signing. | “Android release APK automation exists via GitHub Actions and local EAS.” | Do not claim iOS release CI. | iOS signing, TestFlight/Play tracks, staged rollout. |
| AI/LLM feature | Not found in code | No runtime AI dependencies or app code. | “Yomiji does not use AI; answer checking is deterministic.” | Do not mention AI-powered learning. | Optional recommendation model with evaluation and deterministic guardrails. |
| Backend/API service | Not found in code | No Express/Next/Django/API routes; PRD says no backend for MVP. | “Client-only architecture with WaniKani as external backend.” | Do not claim microservices/cloud backend. | Backend-for-frontend for token exchange, rate limiting, analytics, push. |
| Realtime collaboration | Not found in code | No WebSockets/SSE/polling server. | “No realtime multi-user features; sync is client lifecycle/manual.” | Do not claim live collaboration or server push. | Realtime channel only if social/shared sessions are added. |
| Observability | Partially supported by code | Local `error_log` and diagnostics export; no external monitoring. | “Local diagnostics exist; production telemetry is a gap.” | Do not claim Sentry/Crashlytics dashboards. | Crash/error/performance telemetry, privacy controls, alerts. |
| Testing breadth | Partially supported by code | Strong domain tests; no UI/E2E/coverage thresholds. | “Well-tested domain logic, limited UI automation.” | Do not claim comprehensive end-to-end coverage. | Detox/Maestro E2E, component tests, coverage gates. |
| Deep links | Supported only by README/design intent | `app.json` reserves `yomiji://`; README says route parsing not implemented. | “Scheme reserved, route handling is not built yet.” | Do not claim universal links. | Linking config, route validation, app links/apple association files. |
| Recommended lesson separation | Supported only by README/design intent | README/Roadmap says missing. | “Current lesson pool exists; WaniKani recommended-vs-advanced split is pending.” | Do not claim exact WaniKani web lesson recommendation parity. | Verified algorithm and test fixtures from real web behavior. |

## Step 3/4: 40 System Design and Technical Deep-Dive Questions

## Question 1: What problem does Yomiji solve?

### Strong Interview Answer
Yomiji is a mobile WaniKani client focused on offline-first studying. It lets a user sync WaniKani subjects, assignments, review stats, study materials, and voice actors into local SQLite, then run dashboard, lesson, review, practice, search, and subject-detail workflows from the local cache.

### Evidence from Code
**Implemented and confirmed in code:** README.md:3, README.md:17-20, `src/domain/sync/syncService.ts`, `src/domain/db/schema.ts`, `src/screens/DashboardScreen.tsx`, `ReviewSessionScreen.tsx`, `LessonSessionScreen.tsx`.

### Design Decision / Tradeoff
The app avoids owning a backend and instead makes the device the execution boundary. That reduces infrastructure and latency for study sessions, but pushes sync/conflict/retry complexity into the client.

### Failure Modes
First sync failure leaves screens with little or no cached data. Auth, timeout, offline, rate-limit, hibernation, and server errors are classified and surfaced locally.

### Scaling Discussion
At 10x users, WaniKani API usage scales per device, not through Yomiji infrastructure. At 100x, rate limiting and support/debuggability become harder without a backend or telemetry.

### Honest Improvement
Add a production diagnostics/telemetry layer while preserving token redaction and local-first behavior.

### What Not to Overclaim
Do not describe Yomiji as a full WaniKani backend, social platform, or AI tutor.

## Question 2: Who are the users?

### Strong Interview Answer
The target users are WaniKani learners who want a native mobile study experience with offline access to cached lessons, reviews, search, subject details, notifications, and practice modes.

### Evidence from Code
**Implemented and confirmed in code:** README.md feature sections; `LoginScreen` requires a WaniKani token; dashboard/review/lesson/search/settings screens all center WaniKani workflows.

### Design Decision / Tradeoff
Requiring a WaniKani API token narrows the audience but enables a lean client-only MVP.

### Failure Modes
Users without a token, without required token scopes, or with revoked tokens cannot use the app beyond login/re-authentication.

### Scaling Discussion
User growth mostly increases WaniKani API traffic and support burden, not owned server load.

### Honest Improvement
Add clearer token-scope validation and onboarding copy.

### What Not to Overclaim
Do not claim Yomiji supports non-WaniKani learners or arbitrary Japanese curricula.

## Question 3: What are the core workflows?

### Strong Interview Answer
The core workflows are token login, initial/incremental sync, dashboard summary, lessons, reviews, practice, subject search/browsing/details, settings, notifications, and diagnostics/full refresh.

### Evidence from Code
**Implemented and confirmed in code:** `src/navigation/types.ts` route list; `LoginScreen`, `DashboardScreen`, `ReviewSessionScreen`, `LessonSessionScreen`, `LessonPickerScreen`, `SubjectSearchScreen`, `SubjectCatalogScreen`, `SubjectBrowseScreen`, `SubjectDetailScreen`, `SettingsScreen`, `DiagnosticsScreen`.

### Design Decision / Tradeoff
Workflows are screen-oriented, while reusable logic lives under `src/domain/**`. This keeps business logic testable without React.

### Failure Modes
Some screens still run direct SQL (`DiagnosticsScreen`, `SubjectDetailScreen`, parts of `ReviewSessionScreen`), so repository boundaries are not perfectly enforced.

### Scaling Discussion
At larger datasets, local queries and list rendering become pressure points, especially without broad virtualization evidence.

### Honest Improvement
Move remaining direct SQL into repository functions and add performance tests for large caches.

### What Not to Overclaim
Do not claim a perfectly clean architecture boundary everywhere.

## Question 4: What are the functional requirements?

### Strong Interview Answer
Functional requirements are WaniKani token auth, local sync/cache, lesson/review execution, answer checking, pending progress/material writes, notifications, audio playback, subject search/details, settings, and diagnostics.

### Evidence from Code
**Implemented and confirmed in code:** `WaniKaniClient.ts`, `syncService.ts`, `studyRepository.ts`, `reviewSession.ts`, `answerChecker.ts`, `notificationService.ts`, `vocabularyAudio.ts`, `settings.ts`, `DiagnosticsScreen.tsx`.

### Design Decision / Tradeoff
The MVP prioritizes study correctness and offline continuity over owned backend features.

### Failure Modes
Offline audio download, deep-link parsing, custom font/font-size, and recommended lesson split are explicitly gaps in README.md:190-196.

### Scaling Discussion
Functional scale is limited by local DB performance and WaniKani API limits more than server capacity.

### Honest Improvement
Close README-listed gaps in priority order, starting with deep links or offline audio depending on user feedback.

### What Not to Overclaim
Do not claim full WaniKani/Tsurukame parity.

## Question 5: What non-functional requirements are visible?

### Strong Interview Answer
The code emphasizes offline availability, strict typing, sanitized errors, secure token storage, deterministic domain tests, and release signing. Production observability and E2E coverage are weaker.

### Evidence from Code
**Implemented and confirmed in code:** `tsconfig.json`, `secureToken.ts`, `errorLog.ts`, Jest tests, `.github/workflows/android-release.yml`, `android/app/build.gradle`.

### Design Decision / Tradeoff
For a mobile MVP, local reliability and correctness are higher priority than distributed infrastructure.

### Failure Modes
Without external telemetry, production-only crashes or slow queries may require user-exported diagnostics.

### Scaling Discussion
At 10x/100x, support and observability become major non-functional constraints.

### Honest Improvement
Add Sentry/Crashlytics-style telemetry with token redaction and opt-in/PII boundaries.

### What Not to Overclaim
Do not claim production-grade monitoring.

## Question 6: What tradeoffs shaped the MVP?

### Strong Interview Answer
The biggest tradeoff is client-only local-first architecture: no backend, no queue server, no central cache. That made the app simpler to ship and useful offline, but means sync, retries, and diagnostics live on-device.

### Evidence from Code
**Implemented and confirmed in code:** `REACT_NATIVE_PORT_PRD.md` says no backend for MVP; `syncService.ts` and SQLite schema implement local sync/queues.

### Design Decision / Tradeoff
A backend would help centralize auth, rate limits, telemetry, and push, but would add cost and privacy/security obligations.

### Failure Modes
Client bugs can corrupt local sync state; full refresh exists as recovery.

### Scaling Discussion
Infrastructure scales well because there is little owned infrastructure, but WaniKani API dependence and device diversity become bottlenecks.

### Honest Improvement
Add a small backend-for-frontend only when features require it.

### What Not to Overclaim
Do not present the no-backend choice as universally scalable for all future features.

## Question 7: What is the high-level architecture?

### Strong Interview Answer
It is a React Native client with a domain layer. UI screens call domain services/repositories. `WaniKaniClient` fetches remote API data. `syncService` writes to SQLite and advances cursors. Study flows read SQLite and enqueue pending writes. Native Expo modules provide secure storage, notifications, SQLite, and audio.

### Evidence from Code
**Implemented and confirmed in code:** README project structure; `App.tsx`; `AppNavigator.tsx`; `src/domain/api/WaniKaniClient.ts`; `src/domain/sync/syncService.ts`; `src/domain/db/**`; `src/domain/study/**`.

### Design Decision / Tradeoff
Domain modules are mostly React-free and testable. Some screen-level SQL remains a pragmatic shortcut.

### Failure Modes
Any WaniKani API shape change can break sync parsing; local schema migrations must preserve cached user data.

### Scaling Discussion
At 10x local data, indexes/query plans matter. At 100x users, no owned backend load appears, but API quotas and diagnostics matter.

### Honest Improvement
Document the architecture with a maintained diagram and move direct SQL behind repositories.

### What Not to Overclaim
Do not call it microservices or a multi-tier backend architecture.

## Question 8: What are the main components?

### Strong Interview Answer
The main components are app shell/theme/navigation, auth gate, WaniKani API client, sync coordinator, SQLite repositories, study/review engine, settings store, notification service, audio service, and screen/component UI layer.

### Evidence from Code
**Implemented and confirmed in code:** `App.tsx`, `AppThemeProvider.tsx`, `AppNavigator.tsx`, `WaniKaniClient.ts`, `syncService.ts`, `database.ts`, `studyRepository.ts`, `reviewSession.ts`, `settingsStore.ts`, `notificationService.ts`, `vocabularyAudio.ts`.

### Design Decision / Tradeoff
The split mirrors responsibility: network, persistence, domain behavior, and presentation are mostly separate.

### Failure Modes
State can diverge if pending writes fail repeatedly; sync error logs and diagnostics help inspect this.

### Scaling Discussion
The review engine is in-memory and per-session; it scales with session size, not total users.

### Honest Improvement
Add a formal dependency boundary rule or lint rule once a lint setup exists.

### What Not to Overclaim
Do not claim all screens are purely presentational.

## Question 9: How does data move through the system?

### Strong Interview Answer
Login validates the token with `/user`, stores token and user data, then sync fetches WaniKani collections with cursors. Data is persisted in SQLite. Screens query SQLite. Study actions enqueue local pending writes; sync flushes those writes before fetching newer remote data.

### Evidence from Code
**Implemented and confirmed in code:** `LoginScreen.tsx`, `secureToken.ts`, `WaniKaniClient.ts`, `syncService.ts`, `schema.ts`, `studyRepository.ts`.

### Design Decision / Tradeoff
Flushing pending writes before fetches reduces local/remote divergence.

### Failure Modes
Partial network failures leave writes queued. 422 stale pending rows are discarded by sync logic.

### Scaling Discussion
Incremental cursors reduce bandwidth, but first sync can still be expensive.

### Honest Improvement
Store retry metadata/backoff per pending write for better user-visible diagnostics.

### What Not to Overclaim
Do not claim bidirectional realtime sync.

## Question 10: What is handled client-side vs server-side?

### Strong Interview Answer
Nearly everything is client-side: UI, local cache, sync orchestration, answer checking, review state, settings, notifications, and audio playback. Server-side behavior is the external WaniKani API only.

### Evidence from Code
**Implemented and confirmed in code:** No internal API routes/server framework; `WaniKaniClient.ts` is external API boundary; PRD says no backend MVP.

### Design Decision / Tradeoff
This reduces infrastructure and preserves offline-first UX, but limits central policy enforcement and observability.

### Failure Modes
A compromised device/token can call WaniKani directly; there is no Yomiji server authorization layer.

### Scaling Discussion
The app avoids server scaling, but WaniKani API limits and client release management are constraints.

### Honest Improvement
Introduce a backend only for features that truly need centralization.

### What Not to Overclaim
Do not say there is a custom backend.

## Question 11: What abstraction boundaries matter most?

### Strong Interview Answer
The strongest boundary is `src/domain/**` versus UI. Network is isolated in `WaniKaniClient`, sync in `syncService`, persistence in DB/repositories, and deterministic review/answer logic in study/answers modules.

### Evidence from Code
**Implemented and confirmed in code:** README project structure; tests under `src/domain/**`; `ReviewSessionScreen` uses domain queues/session logic.

### Design Decision / Tradeoff
Keeping domain logic pure improves testability and interview-defensible correctness.

### Failure Modes
Direct SQL in some screens weakens the boundary and can duplicate query logic.

### Scaling Discussion
As features grow, enforcing boundaries becomes more important for maintainability.

### Honest Improvement
Create repository methods for diagnostics/detail/review direct queries.

### What Not to Overclaim
Do not claim strict clean architecture enforcement.

## Question 12: What would you draw in Excalidraw?

### Strong Interview Answer
I would draw a mobile app boundary containing UI screens, domain services, SQLite, SecureStore, AsyncStorage, notifications, and audio. Outside it I would draw WaniKani API plus remote media URLs. Arrows show token login, incremental sync into SQLite, study reads from SQLite, pending writes flushed back to WaniKani, and local notifications scheduled from DB state.

### Evidence from Code
**Implemented and confirmed in code:** `AppNavigator.tsx`, `WaniKaniClient.ts`, `syncService.ts`, `schema.ts`, `secureToken.ts`, `settings.ts`, `notificationService.ts`, `vocabularyAudio.ts`.

### Design Decision / Tradeoff
The diagram makes the lack of owned backend explicit, which is important and honest.

### Failure Modes
The external WaniKani API is a hard dependency for fresh sync and write flushes.

### Scaling Discussion
SQLite and WaniKani API are the main boundaries to annotate for scale.

### Honest Improvement
Add failure arrows for offline, auth errors, rate limits, and full refresh.

### What Not to Overclaim
Do not draw queues/caches/server layers that do not exist.

## Question 13: What are the key API routes or server actions?

### Strong Interview Answer
There are no Yomiji-owned API routes. The key external operations are WaniKani `/user`, collection fetches for subjects/assignments/study materials/level progressions/voice actors/review statistics, assignment start, review creation, and study material upsert.

### Evidence from Code
**Implemented and confirmed in code:** `src/domain/api/WaniKaniClient.ts`; `WaniKaniClient.test.ts`; README Data Sync/Auth sections.

### Design Decision / Tradeoff
Direct API integration keeps architecture simple but exposes the client to API contract changes.

### Failure Modes
HTTP errors, non-JSON 503s, timeouts, and rate limits are handled by client error mapping.

### Scaling Discussion
No internal API servers to scale. WaniKani API quotas constrain aggregate usage.

### Honest Improvement
Add API contract tests around every WaniKani operation shape.

### What Not to Overclaim
Do not call screen actions “server actions.”

## Question 14: How are requests validated?

### Strong Interview Answer
Login validates the token by calling WaniKani `/user`. API requests are wrapped in `WaniKaniClient`, which maps HTTP errors and expects collection shapes. There is no server-side request validation because there is no Yomiji backend.

### Evidence from Code
**Implemented and confirmed in code:** `LoginScreen.tsx`; `WaniKaniClient.ts`; `WaniKaniClient.test.ts` covers pagination and non-JSON error handling.

### Design Decision / Tradeoff
Client-side validation is enough for direct external API use, but cannot enforce server policy.

### Failure Modes
Token scope issues may appear when specific write APIs are called rather than at initial login unless fully checked by `/user`/API behavior.

### Scaling Discussion
At more users, clearer token-scope preflight reduces support incidents.

### Honest Improvement
Validate required scopes explicitly and surface missing-scope guidance.

### What Not to Overclaim
Do not claim schema validation middleware or backend auth checks.

## Question 15: How are errors handled?

### Strong Interview Answer
Errors are categorized, sanitized, stored locally, and shown through UI states. Sync maps offline, timeout, auth, rate-limit, hibernating-account, server, and unknown errors. Auth errors clear the token and force re-login.

### Evidence from Code
**Implemented and confirmed in code:** `src/domain/db/errorLog.ts`, `src/domain/sync/syncService.ts`, `DashboardScreen.tsx`, `DiagnosticsScreen.tsx`, `errorHandling.integration.test.ts`, README.md:36-41.

### Design Decision / Tradeoff
Local error logging fits a no-backend app and supports user-exported diagnostics.

### Failure Modes
No external alert fires when many users hit the same production error.

### Scaling Discussion
At 100x users, local-only logs do not scale for fleet health.

### Honest Improvement
Add privacy-safe crash/error telemetry.

### What Not to Overclaim
Do not claim centralized observability.

## Question 16: How is business logic organized?

### Strong Interview Answer
Business logic lives in domain modules: answer checking, kana input, review session state, lesson/review queues, sync, settings, notifications, dashboard queries, and DB repositories. Screens compose those modules into workflows.

### Evidence from Code
**Implemented and confirmed in code:** `src/domain/answers/*`, `src/domain/study/*`, `src/domain/sync/syncService.ts`, `src/domain/settings/*`, `src/domain/notifications/*`, `src/domain/dashboard/dashboardRepository.ts`.

### Design Decision / Tradeoff
This organization makes domain behavior testable with Jest and in-memory SQLite.

### Failure Modes
UI-level glue can still introduce bugs not covered by domain tests.

### Scaling Discussion
As code grows, domain modules prevent screen bloat, but direct SQL should be reduced.

### Honest Improvement
Add UI/component and E2E tests for workflows.

### What Not to Overclaim
Do not claim all user workflows are E2E tested.

## Question 17: Which operations should be synchronous vs asynchronous?

### Strong Interview Answer
Local reads and review state transitions should feel synchronous from the user's perspective. Network sync, pending write flushes, full refresh, notification scheduling, and audio playback are asynchronous and best-effort where appropriate.

### Evidence from Code
**Implemented and confirmed in code:** `syncService.ts` promises/single-flight; `AppNavigator.tsx` lifecycle sync; `notificationService.ts`; `vocabularyAudio.ts`; `reviewSession.ts` pure state machine.

### Design Decision / Tradeoff
Keeping study interactions local avoids blocking reviews on network availability.

### Failure Modes
Async sync can fail after local user actions, leaving pending queues.

### Scaling Discussion
More users do not affect local sync, but more pending writes per device make flush latency more visible.

### Honest Improvement
Expose pending-write status more explicitly in the UI.

### What Not to Overclaim
Do not claim background sync is a robust server worker.

## Question 18: What happens under high concurrency?

### Strong Interview Answer
On a single device, sync is single-flight using module-scoped active promises, so overlapping sync requests coalesce/serialize. There is no multi-user server concurrency because there is no backend.

### Evidence from Code
**Implemented and confirmed in code:** `syncService.ts` uses `activeSync`/`activePendingSync`; README says full refresh waits for active sync.

### Design Decision / Tradeoff
Single-flight avoids duplicate network fetches and DB races from foreground/manual/background triggers.

### Failure Modes
It does not solve cross-device conflicts for the same WaniKani account; WaniKani remains the remote source.

### Scaling Discussion
At 10x local actions, queue size matters. At 100x users, concurrency is distributed across devices/API clients.

### Honest Improvement
Add explicit cross-device conflict handling/last-write explanations for study materials.

### What Not to Overclaim
Do not claim distributed locking or global concurrency control.

## Question 19: What are the main entities?

### Strong Interview Answer
Main entities are user, subjects, assignments, study materials, level progressions, voice actors, review statistics, sync cursors, audio URLs, subject progress, pending progress writes, pending study material writes, and error log entries.

### Evidence from Code
**Implemented and confirmed in code:** `src/domain/db/schema.ts`; `database.ts`; `dataIntegrity.integration.test.ts`.

### Design Decision / Tradeoff
The schema stores raw WaniKani payload JSON plus indexed columns, balancing fidelity with query speed.

### Failure Modes
Raw JSON can preserve API data but requires careful parsing and migrations when shapes change.

### Scaling Discussion
Indexes matter for assignment availability, subject search, SRS browsing, review stats, and cursor lookups.

### Honest Improvement
Document table/query ownership and add query performance fixtures.

### What Not to Overclaim
Do not claim a normalized relational model for every remote field.

## Question 20: What is the source of truth?

### Strong Interview Answer
After login and sync, SQLite is the app's local source of truth for screens. WaniKani remains the remote source of truth; pending writes bridge local user actions back to WaniKani.

### Evidence from Code
**Implemented and confirmed in code:** AGENTS.md guidance; `schema.ts`; `syncService.ts`; screen/domain repository use.

### Design Decision / Tradeoff
Local source of truth enables offline study and fast UI.

### Failure Modes
SQLite can become stale; incremental sync and full refresh recover freshness.

### Scaling Discussion
The larger the local cache, the more important migrations/indexes and refresh UX become.

### Honest Improvement
Show cache freshness/pending writes consistently across screens.

### What Not to Overclaim
Do not say Yomiji owns canonical WaniKani progress.

## Question 21: Why SQLite?

### Strong Interview Answer
SQLite is a good fit because the app needs durable offline structured data, indexed queries for queues/search/dashboard, transactions, and migrations on-device.

### Evidence from Code
**Implemented and confirmed in code:** Expo SQLite dependency; `schema.ts`; `database.ts`; repository query files; DB integration tests.

### Design Decision / Tradeoff
AsyncStorage would be too weak for relational queries; a remote DB would break offline-first and require backend auth.

### Failure Modes
Bad migrations can corrupt local cache; tests cover schema/data integrity.

### Scaling Discussion
SQLite handles this single-user dataset well, but query/index/list rendering must be profiled with large accounts.

### Honest Improvement
Add migration rollback/backup strategy for user-critical pending queues.

### What Not to Overclaim
Do not claim horizontal database scalability; it is local embedded storage.

## Question 22: What indexes/query patterns matter?

### Strong Interview Answer
Important query patterns are available reviews by `available_at`, lessons by unlocked/started state, subject search by meanings/readings/characters, SRS bucket counts, review forecasts, leech calculations from review stats, and sync cursor lookup.

### Evidence from Code
**Implemented and confirmed in code:** `schema.ts`; `assignmentRepository.ts`; `subjectRepository.ts`; `dashboardRepository.ts`; `studyRepository.ts`; `subjectRepository.test.ts`.

### Design Decision / Tradeoff
The app stores indexed columns beside raw payloads to avoid parsing JSON for every list/dashboard query.

### Failure Modes
Unindexed or screen-level direct queries may degrade on large accounts.

### Scaling Discussion
At 10x cache size, review/search queries need EXPLAIN/profiling. At 100x, list virtualization and pagination become mandatory.

### Honest Improvement
Add performance regression tests for search/dashboard/queue queries.

### What Not to Overclaim
Do not claim measured query latency unless benchmarked.

## Question 23: How are relationships modeled?

### Strong Interview Answer
WaniKani resources are stored as local tables keyed by remote IDs, often retaining full payload JSON. Relationships such as assignments-to-subjects and study-materials-to-subjects are joined locally for queues/details/dashboard.

### Evidence from Code
**Implemented and confirmed in code:** `schema.ts`; `studyRepository.ts`; `subjectRepository.ts`; `SubjectDetailScreen.tsx`; `dataIntegrity.integration.test.ts`.

### Design Decision / Tradeoff
Using remote IDs keeps sync simple and avoids inventing app-owned IDs.

### Failure Modes
Remote deletion/hidden states must be reflected correctly during sync.

### Scaling Discussion
Relationships are single-user and bounded by WaniKani dataset size, so local joins are reasonable.

### Honest Improvement
Centralize relationship queries in repositories rather than screens.

### What Not to Overclaim
Do not claim a complex multi-tenant relational backend.

## Question 24: How would the schema change at 10x scale?

### Strong Interview Answer
I would first measure. Likely changes would be more targeted indexes, paginated/virtualized subject lists, materialized dashboard aggregates, and maybe splitting large raw payload fields from hot query columns.

### Evidence from Code
**Could be improved:** Current schema and repositories exist, but no performance benchmarks or large-scale fixtures were found.

### Design Decision / Tradeoff
Premature denormalization is not needed for MVP; SQLite can handle a single WaniKani account dataset.

### Failure Modes
Dashboard/search could become slow if queries parse or join too much data.

### Scaling Discussion
At 100x data per user, SQLite may still work but UI rendering and sync payload volume become first-order problems.

### Honest Improvement
Add seeded large-account performance tests.

### What Not to Overclaim
Do not claim proven 10x/100x performance.

## Question 25: How is authentication implemented?

### Strong Interview Answer
Authentication is a WaniKani API token flow. The user enters a token, the app validates it with `getUser`, stores it in SecureStore, and uses it in WaniKani API requests. Logout deletes the token and local data.

### Evidence from Code
**Implemented and confirmed in code:** `LoginScreen.tsx`; `secureToken.ts`; `WaniKaniClient.ts`; `SettingsScreen.tsx`; `AppNavigator.tsx`.

### Design Decision / Tradeoff
Token auth matches WaniKani's API and avoids building OAuth/backend infrastructure.

### Failure Modes
Token leakage is sensitive; error sanitization redacts token patterns, and SecureStore is used for storage.

### Scaling Discussion
At 100x users, token support issues and scope validation become prominent.

### Honest Improvement
Add explicit scope detection and a token health screen.

### What Not to Overclaim
Do not claim OAuth, RBAC, sessions, or custom authorization.

## Question 26: How is authorization enforced?

### Strong Interview Answer
Yomiji itself has no multi-user authorization layer. Authorization is delegated to WaniKani API token scopes. Locally, the app gates authenticated screens on whether a token exists and remains valid.

### Evidence from Code
**Implemented and confirmed in code:** `AppNavigator.tsx` auth gate; `LoginScreen.tsx`; `WaniKaniClient.ts`; README says token must include review/study-material scopes.

### Design Decision / Tradeoff
For a single-user mobile client, this is enough for MVP, but it is not a backend authorization model.

### Failure Modes
If token scopes are insufficient, write operations can fail later.

### Scaling Discussion
A backend version would enforce scopes server-side and isolate tokens from clients.

### Honest Improvement
Preflight required scopes and explain missing permissions at login.

### What Not to Overclaim
Do not claim Yomiji enforces per-resource authorization.

## Question 27: What user data is sensitive?

### Strong Interview Answer
The WaniKani API token is the most sensitive data. Cached study progress, mistakes, notes, synonyms, settings, and diagnostics can also be personal.

### Evidence from Code
**Implemented and confirmed in code:** `secureToken.ts`; SQLite tables in `schema.ts`; `errorLog.ts` token redaction; `DiagnosticsScreen.tsx` export.

### Design Decision / Tradeoff
SecureStore protects the token; SQLite cache is local app data.

### Failure Modes
Diagnostics export can disclose local study details if shared carelessly, though tokens are sanitized.

### Scaling Discussion
At production scale, privacy policy and data export/deletion semantics matter.

### Honest Improvement
Add explicit privacy copy before diagnostics export.

### What Not to Overclaim
Do not claim end-to-end encryption of all local cache rows unless implemented.

## Question 28: How are secrets managed?

### Strong Interview Answer
Runtime user tokens are stored in platform SecureStore. Release secrets are GitHub Actions secrets for Expo token and Android keystore material; Gradle fails closed in CI if release signing variables are missing.

### Evidence from Code
**Implemented and confirmed in code:** `secureToken.ts`; `.github/workflows/android-release.yml`; `android/app/build.gradle`; README Release section.

### Design Decision / Tradeoff
User secrets and release secrets are separated: device storage for tokens, CI secrets for signing.

### Failure Modes
No secure-store backup/data-extraction XML rules were found; Android backup behavior should be reviewed.

### Scaling Discussion
More release targets increase signing/secret management complexity.

### Honest Improvement
Audit Android/iOS backup behavior and document token storage guarantees.

### What Not to Overclaim
Do not claim hardware-backed keystore behavior beyond what Expo SecureStore guarantees on the platform.

## Question 29: What abuse cases exist?

### Strong Interview Answer
Potential abuse cases are token theft, excessive WaniKani API calls from repeated sync/full refresh, malformed remote payloads, diagnostics sharing sensitive study data, and local DB corruption or tampering.

### Evidence from Code
**Partially implemented / inferred from code:** SecureStore, rate-limit handling, sanitized logs, full refresh, no backend rate limiter.

### Design Decision / Tradeoff
A client-only app cannot centrally rate-limit or revoke clients.

### Failure Modes
429 rate limits are surfaced with retry timing, but no central abuse detection exists.

### Scaling Discussion
At 100x users, accidental API overuse could become a relationship/API quota problem.

### Honest Improvement
Throttle manual full refresh/sync and add exponential backoff metadata.

### What Not to Overclaim
Do not claim abuse prevention beyond client safeguards and WaniKani limits.

## Question 30: Does Yomiji use AI, LLMs, embeddings, ranking, recommendation, or generation?

### Strong Interview Answer
No AI/LLM integration was found in the app. Answer checking, lesson ordering, leech scoring, and search ranking are deterministic application logic.

### Evidence from Code
**Not implemented / not found:** No AI dependencies in package.json; no AI runtime paths in `src/domain` or `src`. `deep-research-report.md` contains LLM prompt templates only as documentation/tooling context.

### Design Decision / Tradeoff
Deterministic logic is appropriate for correctness-sensitive study answers and easier to test.

### Failure Modes
No model hallucination risk exists because no model is used.

### Scaling Discussion
No inference costs. Future recommendation models would need evaluation and guardrails.

### Honest Improvement
If adding recommendations, keep answer grading deterministic and make model output advisory only.

### What Not to Overclaim
Do not call Yomiji AI-powered.

## Question 31: What remains deterministic application logic?

### Strong Interview Answer
Answer normalization/checking, romaji-to-kana conversion, review ordering, wrap-up behavior, lesson filtering/order, search ranking, leech score, and notification scheduling are deterministic.

### Evidence from Code
**Implemented and confirmed in code:** `answerChecker.ts`, `kanaInput.ts`, `reviewSession.ts`, `studyRepository.ts`, `subjectRepository.ts`, `dashboardRepository.ts`, `notificationService.ts` and associated tests.

### Design Decision / Tradeoff
Determinism makes tests meaningful and user trust stronger.

### Failure Modes
Deterministic rules can still be wrong for edge cases, but tests catch many Japanese-input cases.

### Scaling Discussion
CPU cost is local and bounded by session/list size.

### Honest Improvement
Add real-world answer edge-case fixtures from user reports.

### What Not to Overclaim
Do not imply semantic AI evaluation of answers.

## Question 32: Does the project use realtime features?

### Strong Interview Answer
No. There are no WebSockets, SSE, collaborative sessions, or server push. Sync is lifecycle/manual client sync, and notifications are local scheduled reminders.

### Evidence from Code
**Not implemented / not found:** No realtime dependencies/routes; `AppNavigator.tsx` uses AppState lifecycle; `notificationService.ts` schedules local notifications.

### Design Decision / Tradeoff
Realtime is unnecessary for a single-user study client and would add infrastructure.

### Failure Modes
Data does not update instantly across devices; each device must sync.

### Scaling Discussion
Avoiding realtime greatly simplifies scale.

### Honest Improvement
If multi-device freshness becomes important, add smarter foreground sync/backoff before considering realtime.

### What Not to Overclaim
Do not claim live sync.

## Question 33: What are current bottlenecks?

### Strong Interview Answer
Likely bottlenecks are first sync volume, WaniKani API rate limits/timeouts, large local SQLite queries, non-virtualized UI lists, audio/image network fetches, and lack of fleet observability.

### Evidence from Code
**Partially implemented / inferred from code:** `WaniKaniClient` timeout/rate-limit handling; SQLite query repositories; `SubjectHeroCard` fetches radical SVGs; frontend audit found no broad FlatList/SectionList virtualization evidence.

### Design Decision / Tradeoff
For MVP-sized WaniKani data, simplicity is acceptable.

### Failure Modes
Large accounts may see slow dashboards/search or memory-heavy screens.

### Scaling Discussion
At 10x data, query/index profiling. At 100x users, API quotas and support telemetry.

### Honest Improvement
Add performance instrumentation and virtualized lists where result sets can grow.

### What Not to Overclaim
Do not claim measured performance or load testing.

## Question 34: What can be cached?

### Strong Interview Answer
Remote WaniKani resources are already cached in SQLite, with cursors for incremental refresh. Audio URL metadata is cached, but audio files are streamed, not downloaded. Radical image SVGs are fetched/cached at component level for rendering fallback.

### Evidence from Code
**Implemented and confirmed in code:** `schema.ts`, `database.ts`, `syncService.ts`, `vocabularyAudio.ts`, `SubjectHeroCard.tsx`, README audio gap.

### Design Decision / Tradeoff
Caching metadata gives offline structure without taking responsibility for media storage.

### Failure Modes
Offline reviews cannot play uncached/downloaded audio because downloads are not implemented.

### Scaling Discussion
Media caching would introduce storage quotas and eviction policies.

### Honest Improvement
Implement optional offline audio downloads with limits and cleanup.

### What Not to Overclaim
Do not say all WaniKani assets are available offline.

## Question 35: How would you reduce latency?

### Strong Interview Answer
Keep study interactions local, batch/incremental sync, index hot queries, avoid re-parsing payload JSON in hot paths, virtualize lists, precompute dashboard aggregates, and prefetch media where allowed.

### Evidence from Code
**Partially implemented / could be improved:** Local-first SQLite and cursors exist; performance benchmarks/materialized aggregates were not found.

### Design Decision / Tradeoff
The current design already removes network latency from core review interactions.

### Failure Modes
Initial sync and full refresh still depend on network/API speed.

### Scaling Discussion
At 100x, avoid simultaneous full refresh storms and measure API retries.

### Honest Improvement
Add instrumentation around sync duration and dashboard query time.

### What Not to Overclaim
Do not claim CDN/backend caching controlled by Yomiji.

## Question 36: What happens if WaniKani fails?

### Strong Interview Answer
Cached study/search/detail data remains available locally. Fresh sync and pending write flush fail, are categorized/sanitized, and remain retryable except stale 422 pending rows that are discarded.

### Evidence from Code
**Implemented and confirmed in code:** `syncService.ts`, `errorLog.ts`, `pendingWrites.integration.test.ts`, `errorHandling.integration.test.ts`, README Data Sync.

### Design Decision / Tradeoff
Offline-first behavior protects study continuity, while remote writes wait for recovery.

### Failure Modes
Users may believe progress is remote before pending writes flush; UI should make pending state clear.

### Scaling Discussion
Widespread WaniKani outage affects all clients; no Yomiji backend can buffer centrally.

### Honest Improvement
Improve pending-write status and retry/backoff visibility.

### What Not to Overclaim
Do not claim offline writes are instantly reflected in WaniKani.

## Question 37: Are operations idempotent?

### Strong Interview Answer
Some operations are designed to be retryable through pending queues and local upserts. Full sync/upserts are idempotent locally. Remote write idempotency depends on WaniKani API behavior; the app handles stale 422 rows explicitly.

### Evidence from Code
**Partially implemented / inferred from code:** `database.ts` put/upsert helpers; `syncService.ts`; `pendingWrites.integration.test.ts`.

### Design Decision / Tradeoff
Local idempotency is controlled; remote idempotency is limited by external API contracts.

### Failure Modes
Duplicate or conflicting remote writes are possible if API semantics are not idempotent.

### Scaling Discussion
At higher usage, explicit idempotency keys would be valuable but require backend/API support.

### Honest Improvement
Track write attempt counts, last error, and remote response per pending row.

### What Not to Overclaim
Do not claim exactly-once delivery.

## Question 38: What tests exist?

### Strong Interview Answer
Tests are strongest in domain logic: DB schema/integrity, sync, pending writes, notifications, WaniKani client pagination/errors, settings migrations, answer checking, kana input, review session, study repository, subject search/radical SVG, and color utilities. UI/E2E coverage was not found.

### Evidence from Code
**Implemented and confirmed in code:** `jest.config.js`; `src/test/*`; `src/domain/**/*.test.ts`; integration tests named in README/testing evidence.

### Design Decision / Tradeoff
Testing pure/domain logic gives high leverage for correctness-sensitive study behavior.

### Failure Modes
Navigation/UI regressions can slip through.

### Scaling Discussion
As the UI grows, E2E tests become more important than more unit tests alone.

### Honest Improvement
Add a small Maestro/Detox smoke suite: login mock, first sync, review answer, lesson quiz, settings/logout.

### What Not to Overclaim
Do not claim full end-to-end test coverage or coverage thresholds.

## Question 39: How is Yomiji deployed?

### Strong Interview Answer
The repo has Android release automation. Version bump script updates versions and tags; GitHub Actions on `v*` installs dependencies, runs typecheck/tests, decodes keystore secrets, builds a local EAS production APK, verifies signature, and publishes a GitHub Release.

### Evidence from Code
**Implemented and confirmed in code:** README Release; `scripts/version-bump.sh`; `.github/workflows/android-release.yml`; `eas.json`; `android/app/build.gradle`.

### Design Decision / Tradeoff
Android APK automation is concrete and reproducible. iOS config exists but equivalent release CI was not found.

### Failure Modes
Release depends on GitHub secrets and EAS/Expo tooling availability.

### Scaling Discussion
At production scale, add staged rollout channels, iOS release automation, crash monitoring, and rollback/update strategy.

### Honest Improvement
Add iOS/TestFlight pipeline and release health checks.

### What Not to Overclaim
Do not claim containerized/cloud deployment; this is a mobile app release pipeline.

## Question 40: What product/UX decisions support the technical goals?

### Strong Interview Answer
The UX reinforces local-first studying: first-sync panel, clear loading/error/empty states, dashboard study cards, inline review details, confirm-leave banners, local notifications, settings for review/lesson behavior, diagnostics/full refresh, theme support, and accessibility labels/tooltips.

### Evidence from Code
**Implemented and confirmed in code:** README UI sections; `DashboardScreen.tsx`; `ReviewSessionScreen.tsx`; `LessonSessionScreen.tsx`; `ScreenLayout.tsx`; `ConfirmLeaveBanner.tsx`; `ReviewQuickSettings.tsx`; `SettingsScreen.tsx`; `DiagnosticsScreen.tsx`; `TooltipPressable.tsx`.

### Design Decision / Tradeoff
Exposing diagnostics and full refresh acknowledges sync complexity rather than hiding it.

### Failure Modes
Too many settings can increase UX complexity; missing E2E tests increase regression risk.

### Scaling Discussion
At more users, onboarding and support copy matter as much as backend scale.

### Honest Improvement
Use real user testing to simplify settings and clarify pending sync states.

### What Not to Overclaim
Do not claim polished accessibility audits or user research unless separately evidenced.

## Step 5: 15 Brutal Follow-Up Questions

### Brutal 1: If there is no backend, how do you handle rate limiting and abuse?
- **Why difficult:** There is no central control plane.
- **Strong answer:** WaniKani enforces API limits; the client surfaces 429 and retry timing via `WaniKaniClient`/`errorLog`. Sync is single-flight to avoid duplicate local calls.
- **Honest caveat:** No fleet-wide throttling or abuse detection exists.
- **Better production design:** Backend-for-frontend with token broker, request shaping, and aggregate rate telemetry.

### Brutal 2: How do you know reviews were actually submitted if the app goes offline?
- **Why difficult:** Local progress and remote progress can diverge.
- **Strong answer:** Reviews are queued locally in pending writes and flushed before remote fetches; cached UI remains usable.
- **Honest caveat:** It is not exactly-once delivery.
- **Better production design:** Persist attempt metadata, retry backoff, conflict status, and remote acknowledgements.

### Brutal 3: What stops token leakage through logs?
- **Why difficult:** User API token is sensitive.
- **Strong answer:** Tokens are stored in SecureStore and sync errors are sanitized/redacted before local logging.
- **Honest caveat:** Need to audit every future logging path and diagnostics export.
- **Better production design:** Central redaction tests, privacy review, no-token logging types, telemetry scrubber.

### Brutal 4: Why no OAuth?
- **Why difficult:** Token copy/paste is less polished.
- **Strong answer:** WaniKani token auth is simple, supported, and matches client-only MVP constraints.
- **Honest caveat:** OAuth/backend token exchange would be better UX/security if available/needed.
- **Better production design:** OAuth or backend token exchange with scoped storage and revocation UX.

### Brutal 5: How do you debug production crashes?
- **Why difficult:** No external monitoring found.
- **Strong answer:** Local sanitized error log and Diagnostics export help debug sync failures.
- **Honest caveat:** Crashes/performance issues lack fleet telemetry.
- **Better production design:** Sentry/Crashlytics with PII/token scrubbing and release markers.

### Brutal 6: Why should I trust the review algorithm?
- **Why difficult:** Study correctness is core.
- **Strong answer:** Review behavior is in a domain state machine with tests for ordering, grouping, wrap-up, wrong counts, practice mode, and answer checking.
- **Honest caveat:** UI workflow and full E2E parity are not fully tested.
- **Better production design:** Golden tests against Tsurukame/WaniKani scenarios plus E2E sessions.

### Brutal 7: What breaks first with a very large WaniKani account?
- **Why difficult:** No performance benchmarks found.
- **Strong answer:** First sync, dashboard/search queries, and list rendering are likely first bottlenecks.
- **Honest caveat:** This audit found no load/performance tests.
- **Better production design:** Large fixture benchmark suite, query profiling, virtualization, aggregate tables.

### Brutal 8: Is local SQLite encrypted?
- **Why difficult:** Sensitive study data may be cached.
- **Strong answer:** Token uses SecureStore; repository evidence does not show encrypted SQLite.
- **Honest caveat:** Do not claim encrypted local cache.
- **Better production design:** SQLCipher or OS-protected encrypted storage for sensitive rows, with migration plan.

### Brutal 9: What if WaniKani API changes response shape?
- **Why difficult:** Direct external dependency.
- **Strong answer:** The client has typed API boundaries and tests around pagination/error cases; raw payloads preserve source data.
- **Honest caveat:** There is no contract test suite against live API schemas.
- **Better production design:** API schema fixtures, live canaries, versioned parser tests.

### Brutal 10: Why are some screens doing direct SQL?
- **Why difficult:** Boundary inconsistency.
- **Strong answer:** Most logic is domain/repository-based; remaining direct SQL appears in diagnostics/detail/review areas for pragmatic local queries.
- **Honest caveat:** It weakens the architecture boundary.
- **Better production design:** Move those queries into repositories and test them.

### Brutal 11: How do you handle multi-device conflicts?
- **Why difficult:** No central server or conflict UI.
- **Strong answer:** WaniKani is remote source of truth; each device syncs and pending writes flush through the API.
- **Honest caveat:** Explicit cross-device conflict resolution is not implemented.
- **Better production design:** Conflict detection for study materials, updated timestamps, user-visible resolution.

### Brutal 12: Are notifications reliable after reboot/timezone changes?
- **Why difficult:** Mobile notification semantics are platform-specific.
- **Strong answer:** Notification scheduling is tested for threshold/daily/badge/vacation and Android boot permission is present.
- **Honest caveat:** No device-matrix/E2E proof found.
- **Better production design:** Native integration tests, reboot/timezone QA, delivery telemetry.

### Brutal 13: Where is the backend scalability story?
- **Why difficult:** There is no backend.
- **Strong answer:** The honest story is client-only scalability: no owned server tier, local SQLite, external WaniKani API as dependency.
- **Honest caveat:** It does not demonstrate distributed backend design.
- **Better production design:** Discuss when to add BFF, queues, cache, telemetry, push.

### Brutal 14: Why no UI/E2E tests?
- **Why difficult:** User workflows are UI-heavy.
- **Strong answer:** Domain behavior has strong coverage; UI automation is a known gap.
- **Honest caveat:** Navigation and rendering regressions can slip through.
- **Better production design:** Add smoke E2E for login/sync/review/lesson/settings and component tests for critical screens.

### Brutal 15: Is the README overstated?
- **Why difficult:** README is detailed and broad.
- **Strong answer:** Most major claims match code evidence, and README explicitly lists gaps.
- **Honest caveat:** Avoid implying production-grade observability, full parity, offline media, universal links, or iOS release automation.
- **Better production design:** Keep README status tied to tests/releases and move roadmap gaps into tracked issues.

## Step 6: Final Interview Prep Sections

# A. 60-Second Project Pitch

“Yomiji is an offline-first React Native/Expo mobile client for WaniKani. Users authenticate with a WaniKani API token, then the app incrementally syncs subjects, assignments, study materials, review stats, and related metadata into local SQLite. After that, core workflows—dashboard, lessons, reviews, practice, search, and subject details—run from the local database, with pending review and study-material writes queued and flushed when online. The architecture is intentionally client-only for the MVP: WaniKani is the external backend, SQLite is the local source of truth, SecureStore protects the token, and Expo modules handle notifications and audio. The strongest parts are deterministic domain logic, offline-first sync, and tests around DB/sync/review behavior. The honest gaps are no owned backend, no external observability, no UI/E2E suite, no offline audio downloads, and Android-only release automation in the repo.”

# B. 3-Minute Technical Deep Dive

Yomiji solves mobile WaniKani studying with offline continuity. The app is a single Expo/React Native TypeScript package. `App.tsx` sets up providers, theme, navigation, and notification tap routing. `AppNavigator.tsx` is the auth gate and lifecycle sync orchestrator.

The main data flow starts with token login in `LoginScreen`, validated through `WaniKaniClient.getUser`. The token is stored in Expo SecureStore, while app settings are versioned in AsyncStorage/Zustand. Sync is coordinated by `syncService`: it flushes pending local writes first, fetches WaniKani collections incrementally using `updated_after` cursors, stores remote payloads and indexed columns in SQLite, and logs sanitized categorized errors.

Study workflows read from SQLite. `studyRepository` builds lesson/review/practice queues. `reviewSession` is an in-memory state machine for ordering, wrong-answer delay, grouping, wrap-up, cheats, and practice behavior. `answerChecker` and `kanaInput` implement deterministic answer validation rather than AI.

The key tradeoff is no Yomiji backend. That gives simple infrastructure and fast offline UX, but means rate limiting, observability, and conflict handling are limited to the device plus WaniKani API behavior. Reliability is handled through pending queues, single-flight sync, full refresh, sanitized local logs, and explicit UI errors. In production I would add privacy-safe telemetry, UI/E2E tests, performance benchmarks, explicit pending-write status, iOS release automation, and eventually a backend-for-frontend only if needed for push, OAuth, analytics, or central rate limiting.

# C. Excalidraw Whiteboard Plan

```text
[User]
  |
  v
[Expo / React Native App: Yomiji]
  |-- App.tsx: providers, theme bridge, notification tap routing
  |-- AppNavigator.tsx: auth gate, foreground/background sync
  |-- Screens: Login, Dashboard, Review, Lesson, Search, Detail, Settings, Diagnostics
  |
  |-- Domain Layer
  |     |-- WaniKaniClient.ts  -----------------------> [External WaniKani REST API]
  |     |        user, subjects, assignments,
  |     |        study materials, reviews, stats
  |     |
  |     |-- syncService.ts
  |     |        flush pending writes -> fetch incremental -> persist -> cursors
  |     |
  |     |-- study/review/answers
  |     |        deterministic queues, state machine, answer checker
  |     |
  |     |-- notifications/audio/settings/dashboard
  |
  |-- Local Storage Boundary
        |-- SQLite: cached WaniKani data, cursors, pending queues, error_log
        |-- SecureStore: WaniKani API token
        |-- AsyncStorage/Zustand: settings
        |-- Expo Notifications: local reminders/badges
        |-- Expo Audio: streamed vocabulary audio

Failure boundaries:
- Offline/timeout/rate limit/server/auth errors at WaniKaniClient/syncService
- Pending writes remain local until flushed
- Full refresh clears remote cache but preserves pending writes
- No owned backend/cache/queue/model layer exists
```

# D. Top 5 Strengths

1. **Offline-first architecture:** SQLite source of truth after sync, cursors, pending queues.
2. **Deterministic study correctness:** Answer checker, kana input, review session state machine, lesson/review queues.
3. **Failure-aware sync:** Single-flight sync, categorized sanitized errors, auth reset, full refresh.
4. **Practical mobile integrations:** SecureStore, Expo SQLite, notifications, audio, NativeWind theme bridge.
5. **Domain-focused tests:** DB/sync/pending writes/notifications/answers/review/settings/API client tests.

# E. Top 5 Weaknesses

1. **No external observability**
   - Evidence: local `error_log`/Diagnostics only; no Sentry/Crashlytics dependency found.
   - Risk: production crashes and fleet-wide sync failures are hard to see.
   - Safe explanation: “Local diagnostics exist; fleet telemetry is a production gap.”
   - Production improvement: add privacy-safe crash/error/performance telemetry.

2. **No owned backend**
   - Evidence: no server framework/API routes; PRD says no backend MVP.
   - Risk: no central rate limiting, token brokering, push orchestration, analytics, or conflict service.
   - Safe explanation: “That was an intentional MVP tradeoff for local-first behavior.”
   - Production improvement: add a narrow backend-for-frontend only for features that need it.

3. **No UI/E2E coverage found**
   - Evidence: Jest domain tests; no Detox/Maestro/component setup or coverage config found.
   - Risk: navigation/rendering regressions can pass domain tests.
   - Safe explanation: “Domain logic is covered; UI automation is the next testing layer.”
   - Production improvement: E2E smoke suite for login/sync/review/lesson/settings.

4. **Some architecture boundary leakage**
   - Evidence: direct SQL in `DiagnosticsScreen`, `SubjectDetailScreen`, `ReviewSessionScreen`.
   - Risk: duplicated queries and harder testing.
   - Safe explanation: “Most logic is domain-based; a few pragmatic screen queries remain.”
   - Production improvement: move all query logic into repositories and test it.

5. **Missing roadmap features**
   - Evidence: README gaps for recommended lessons split, offline audio downloads, deep-link parsing/universal links, custom font/font-size.
   - Risk: overclaiming parity or offline completeness.
   - Safe explanation: “The README calls these out as known gaps.”
   - Production improvement: implement and test gaps based on user value.

# F. Resume/Portfolio Rephrasing

## 1. Resume bullet

Built Yomiji, an offline-first Expo/React Native WaniKani study app using TypeScript, SQLite, SecureStore, and Expo native modules; implemented incremental sync with per-collection cursors, local pending-write queues for reviews/lessons/study materials, deterministic review/answer logic, local notifications, diagnostics, and Android release automation.

## 2. Portfolio description

Yomiji is a client-only mobile WaniKani companion designed around offline study. It validates a user-supplied WaniKani API token, syncs remote data into local SQLite, and runs dashboard, lesson, review, practice, search, and subject-detail workflows from the local cache. The project emphasizes deterministic domain logic, sync reliability, sanitized local diagnostics, and pragmatic mobile integrations. It does not currently include an owned backend, AI features, offline audio downloads, universal links, or production telemetry.

## 3. Interview explanation

I intentionally scoped Yomiji as a local-first mobile system rather than a backend-heavy product. The interesting design work is in the sync boundary: SQLite is the local source of truth, WaniKani remains the remote source, and pending queues bridge offline actions back to the API. That let me focus on correctness, failure handling, and mobile UX while being honest that production observability, UI E2E testing, central rate limiting, and some roadmap features are future work.

# G. Final Summary Table

| Area                 | Finding |
| -------------------- | ------- |
| Product Purpose      | Offline-first mobile WaniKani study client. |
| Architecture         | Single Expo/React Native app with domain services, local SQLite, and direct WaniKani API integration. |
| Frontend             | React Native/Expo screens with React Navigation and NativeWind/Tailwind theming. |
| Backend              | No owned backend or internal API routes found; WaniKani is the external backend. |
| Data Storage         | SQLite for cached remote data, cursors, pending queues, audio URLs, error logs; SecureStore for token; AsyncStorage/Zustand for settings. |
| Auth/Security        | User-supplied WaniKani API token validated against `/user`, stored in SecureStore, cleared on 401/403/logout; no OAuth/RBAC. |
| AI/LLM Usage         | None implemented in app code; answer checking and recommendations are deterministic. |
| External APIs        | WaniKani v2 REST API, WaniKani media URLs, Expo native APIs. |
| Reliability          | Single-flight sync, pending-write queues, error classification/redaction, full refresh, local diagnostics. |
| Scalability          | Scales by avoiding owned server infrastructure; bottlenecks are WaniKani API limits, first sync, local queries, UI list rendering, and support observability. |
| Observability        | Local `error_log` and diagnostics export only; no external telemetry found. |
| Testing              | Strong domain/unit/integration coverage; no UI/E2E/coverage threshold found. |
| Deployment           | Android GitHub Actions + EAS local APK release; iOS config exists but no iOS release workflow found. |
| Biggest Strength     | Offline-first sync and deterministic study domain logic. |
| Biggest Weakness     | Lack of production observability/UI E2E and no central backend controls. |
| Best Interview Angle | “A deliberately client-only local-first mobile system with clear sync, storage, failure-handling, and honest production tradeoffs.” |
