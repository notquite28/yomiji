# Pulled Commits Correctness Review

Reviewed range: `d4e7fd5..a0d40aa`

Pulled commits:

- `4f7c141 fix(sync): harden WaniKani parity handling`
- `66618eb Release v0.4.8`
- `38672bb test(ci): fix full-suite regressions`
- `6dd136e Release v0.4.9`
- `a0d40aa test(notifications): avoid fixed future dates`

## Summary

The pulled changes pass typecheck and the Jest suite, but they are not fully safe to ship. The main risk is silent loss or corruption of queued study-material edits when sync, rate-limit budgeting, and full refresh interact.

## Verification Performed

- `pnpm typecheck` passed.
- `pnpm test` passed: 18 suites, 283 tests.
- Focused test run passed:
  - `src/domain/api/WaniKaniClient.test.ts`
  - `src/domain/sync/syncService.integration.test.ts`
  - `src/domain/study/pendingWrites.integration.test.ts`
  - `src/domain/notifications/notificationService.test.ts`
- SQLite foreign-key behavior was reproduced separately: deleting a referenced `subjects` row while a `pending_study_materials` row still references it fails with `FOREIGN KEY constraint failed`.

## Findings

### 1. Queued study-material edits can be overwritten before flush

**Severity:** High

**File:** `src/domain/sync/syncService.ts`

**Area:** `sendPendingStudyMaterials`

`sendPendingStudyMaterials` selects only `subject_id` from `pending_study_materials`, then rebuilds the API payload from the mutable `study_materials` cache row.

That makes `study_materials` the source of truth even though `pending_study_materials.payload` contains the user’s intended queued edit.

Failure path:

1. User edits a study material offline or while sync is budget-limited.
2. `queueStudyMaterialUpdate` writes the intended edit to `pending_study_materials` and optimistically updates `study_materials`.
3. Incremental sync reserves request budget and skips the pending edit.
4. Download sync fetches remote study materials and overwrites the optimistic `study_materials` row.
5. Later pending sync reads from `study_materials`, sends the overwritten remote values, deletes the pending row, and silently drops the user’s queued edit.

**Why it matters:** User note/synonym edits can be lost without an error, retry, or visible conflict.

**Recommended fix:** Treat `pending_study_materials.payload` as the source of truth when sending queued edits. Do not rebuild the outgoing API payload from `study_materials`. If downloaded remote data must be applied while pending edits remain, reapply pending edits after download or block that overwrite.

### 2. Full refresh can fail when pending study-material rows remain

**Severity:** High

**File:** `src/domain/sync/syncService.ts`

**Area:** `runFullRefresh`

`runFullRefresh` calls `runPendingOnly(options, 'standalone')`, then immediately calls `clearRemoteCache(options.db)`.

`runPendingOnly` is rate-budgeted. It can return with pending writes still present, for example:

- A local study-material create needs two requests: one lookup plus one POST.
- The client has only one request remaining.
- There are more queued edits than the current request budget allows.

If any `pending_study_materials` row remains, `clearRemoteCache` attempts to delete `subjects`. That violates the foreign key from `pending_study_materials.subject_id` to `subjects.id`.

**Why it matters:** Full refresh is supposed to be a recovery path, but it can fail under normal SQLite foreign-key enforcement and leave the app unable to refresh.

**Recommended fix:** Before clearing remote cache, require pending queues to be empty. If budget prevents a full flush, defer the full refresh and surface a retryable rate-limit state. Alternative: remove the foreign-key coupling for durable pending writes, but preserving pending writes across cache clears needs explicit design.

### 3. Explicit null note clears are not preserved

**Severity:** Medium

**File:** `src/domain/study/studyRepository.ts`

**Area:** `queueStudyMaterialUpdate`

`StudyMaterialPayload` allows note fields to be `string | null`:

- `meaningNote?: string | null`
- `readingNote?: string | null`

The coalescing logic uses nullish coalescing:

- `payload.meaningNote ?? pendingPayload?.meaningNote ?? localData?.meaning_note ?? ''`
- `payload.readingNote ?? pendingPayload?.readingNote ?? localData?.reading_note ?? ''`

That treats explicit `null` as “not provided” and falls back to the previous pending or local note.

**Why it matters:** If the user clears a note, the app can keep and resend the old note instead of clearing it remotely.

**Recommended fix:** Distinguish `undefined` from `null`. Use a helper or explicit checks so `null` remains an intentional clear:

```ts
const meaningNote = payload.meaningNote !== undefined
  ? payload.meaningNote
  : pendingPayload?.meaningNote !== undefined
    ? pendingPayload.meaningNote
    : localData?.meaning_note ?? '';
```

### 4. Partial study-material edits can become destructive full updates

**Severity:** Medium

**File:** `src/domain/sync/syncService.ts`

**Area:** `sendPendingStudyMaterials`

When sending pending study-material updates, the current code builds this payload from local cached data:

- `meaningNote: parsed.data.meaning_note ?? ''`
- `readingNote: parsed.data.reading_note ?? ''`
- `meaningSynonyms: parsed.data.meaning_synonyms ?? []`

If the user changed only one field and the local row is a placeholder or incomplete cache entry, missing fields become empty strings or empty arrays. `upsertStudyMaterial` then sends them in a PUT/POST body.

**Why it matters:** A partial user edit can clear remote synonyms or notes the user did not touch.

**Recommended fix:** Preserve which fields were changed in the pending payload and send only those fields. If a full PUT is required, first merge with verified remote state, not local defaults.

### 5. Rate-limit reset handling ignores server clock skew

**Severity:** Medium

**File:** `src/domain/api/WaniKaniClient.ts`

**Area:** `updateRateLimit`, `rateLimitResetMs`, `retryAfterMsFromHeaders`

`RateLimit-Reset` is a WaniKani server epoch timestamp in seconds. The client stores it as `resetSeconds * 1000` and later compares it directly with local `Date.now()`.

The same client already estimates clock skew from the response `Date` header, but that skew is not applied to the reset timestamp.

Failure path:

1. Device clock is ahead of WaniKani server time.
2. API response says `RateLimit-Remaining: 0` and gives a future server `RateLimit-Reset`.
3. Local comparison thinks the reset already passed.
4. `requestsRemainingInInterval` returns a full budget or retry delay becomes zero.
5. Sync can immediately send more requests and hit 429 again.

**Why it matters:** Rate-limit budgeting can become inaccurate on devices with clock skew, causing avoidable 429s and bad pending-sync scheduling.

**Recommended fix:** Convert server reset epochs into local time by subtracting the estimated skew, or compare using server-adjusted now consistently.

## Non-Finding: Notification and Release Changes

The notification test change looks safe. It replaces fixed future dates that had expired with dynamically future UTC dates.

Release metadata is aligned:

- `package.json`: `0.4.9`
- `app.json`: `0.4.9`
- Android build/version files: build number `23`

## Overall Recommendation

Do not rely on the current green test suite as sufficient evidence. Add regression tests for these cases before shipping fixes:

1. Pending study-material payload survives a download refresh that overwrites `study_materials`.
2. Full refresh does not clear remote cache when pending writes remain after a budget-limited flush.
3. `null` note clears remain `null` through queue coalescing and sync.
4. Partial study-material edits do not clear untouched remote fields.
5. Rate-limit reset calculations work when local clock differs from server `Date`.
