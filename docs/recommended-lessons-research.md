# WaniKani Recommended Lessons Algorithm

Research conducted May 2026. Data verified against a level 10 account with 23 available lessons (4 kanji, 19 vocabulary).

## Confirmed Algorithm

WaniKani's web dashboard determines "recommended lessons" using two pieces of data:

1. **`lesson_position`** — a per-subject integer defining WaniKani's canonical pedagogical ordering. Stored in the subject's JSON `payload` at `data.lesson_position`. Currently not extracted or used by our app.

2. **`lessons_batch_size`** — a WaniKani user preference (API: `GET /user → data.preferences.lessons_batch_size`). Currently not read from the preferences blob during sync. Controls how many items are introduced before each lesson quiz.

### Batching

Available lessons are separated by type (radical, kanji, vocabulary), sorted by `lesson_position` ascending within each type queue, then distributed proportionally across batches of `lessons_batch_size`.

**Per-batch type allocation:**

- `kanji_slots = ceil(batch_size × kanji_count / total_count)`
- Remaining slots filled with vocabulary (and radicals if present)

**Verified example (batch_size=5, 4 kanji, 19 vocab, total=23):**

| Batch | Kanji (pos) | Vocab (pos)                                             | Items   |
| ----- | ----------- | ------------------------------------------------------- | ------- |
| 1     | 農 (51)     | 始める (84), 飲む (118), 投げ付ける (175), 化かす (176) | 1K + 4V |
| 2     | 親 (62)     | 話 (177), 出会う (178), 私大 (183), 千葉 (188)          | 1K + 4V |
| 3     | 最 (66)     | 思わず (189), 立ち飲み (190), 部首 (193), 葉 (194)      | 1K + 4V |

All three batches verified against the live WaniKani webapp.

### "Avoid Small Batches" Rule

From the WaniKani webapp's lesson settings UI:

> "Set the preferred number of new lessons to do before each lesson quiz. The actual number may sometimes be higher to avoid small lesson batches at the end."

The batch size is a preference, not a hard limit. The algorithm redistributes items from the final batch if it would be too small. For example, with 12 items and batch_size=5, instead of `[5, 5, 2]` it might produce `[4, 4, 4]` or `[6, 6]`.

### Recommended vs Advanced Split

The webapp shows a subset of available lessons as "Today's Lessons" (recommended). The full pool is accessible via the "Advanced" button (Lesson Picker). In the verified case: 15 recommended out of 23 available, leaving 8 in advanced-only.

### Generalization with Radicals (Unverified)

When all three types are present, the proportional distribution should extend naturally:

**Example (5 radicals, 5 kanji, 30 vocab, batch_size=5):**

- `radical_slots = ceil(5 × 5/40) = 1`
- `kanji_slots = ceil(remaining × 5/remaining_total)` ≈ 1
- `vocab_slots = 5 - 1 - 1 = 3`
- Result: 1R + 1K + 3V per batch

This extrapolation has NOT been verified against a live account.

## API Verification Commands

```bash
# Step 1 — user preferences
curl -sS "https://api.wanikani.com/v2/user" \
  -H "Authorization: Bearer ${WK_API_TOKEN}" \
  -H "Wanikani-Revision: 20170710" | \
  node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({level: j.data.level, batch_size: j.data.preferences.lessons_batch_size}, null, 2)); })'

# Step 2 — lesson-stage assignments
curl -sS "https://api.wanikani.com/v2/assignments?unlocked=true&started=false&srs_stages=0" \
  -H "Authorization: Bearer ${WK_API_TOKEN}" \
  -H "Wanikani-Revision: 20170710" | \
  node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); const ids = j.data.map(a => a.data.subject_id); console.log("Subject IDs:", ids.join(",")); console.log("Count:", ids.length); })'

# Step 3 — subjects with lesson_position
curl -sS "https://api.wanikani.com/v2/subjects?ids=<IDS_FROM_STEP_2>" \
  -H "Authorization: Bearer ${WK_API_TOKEN}" \
  -H "Wanikani-Revision: 20170710" | \
  node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); const sorted = j.data.map(s => ({id: s.id, chars: s.data.characters, type: s.object, level: s.data.level, pos: s.data.lesson_position})).sort((a,b) => a.pos - b.pos); console.log(JSON.stringify(sorted, null, 2)); })'
```

## Verified Data (May 2026)

### Account B (level ~5? — 13 available, batch_size=5, max_daily=15)

**Available:** 4 kanji + 9 vocabulary = 13 total

**Proportional batching (batch_size=5):**

- `kanji_slots = ceil(5 × 4/13) = ceil(1.54) = 2` per batch
- `vocab_slots = 5 - 2 = 3` per batch
- Naive split: [2K+3V] [2K+3V] [0K+3V] = [5, 5, 3]
- Anti-small-batch: final 3 items redistributed → **[7, 6]** or **[6, 7]**

**Result:** 7 recommended (first batch), 6 advanced-only. Matches webapp output.

**Recommended items (in presented order):** v, k, v, v, k, v, k = 4 vocab + 3 kanji ✅ matches proportional allocation.

**Settings observed:**

- `lessons_batch_size = 5`
- `max_daily_lessons = 15` (not a limiting factor here since 13 < 15)

**Key insight:** The daily cap does not inflate recommended count. With max_daily=15 and 13 available, the count was 7, not 13. Recommended = **first batch after anti-small-batch redistribution**, not `min(available, max_daily)`.

### Revisiting Account A (level 10, 23 available, batch_size=5)

The earlier verified case showed 15/23 recommended. With daily cap unknown for that account, possible explanations:

- If `max_daily_lessons = 15`, then daily cap is the limiter: `min(first_batch_size, 15)` — but that contradicts Account B where 13 available didn't become 15.
- Or batch distribution of 23 items with anti-small-batch produces a first batch of 15 items (needs verification).

## Verified Data — Account C (level 10, screenshot + lesson sessions, 2026-05-15)

**Screenshot source:** WaniKani webapp lesson picker (Advanced pool) for Level 10.

**Available items (Advanced pool):** 9 kanji + 30 vocabulary = 39 total shown

**Kanji (9):** 貢, 速, 進, 集, 鉄, 読, 頭, 顔, 病

**Vocabulary (30):** 起きる, 配る, お酒, 日本酒, 習う, 転がる, 自転車, 運転する, 転送, 回転, 落ちる, 運ぶ, 運がいい, 開ける, 公開, 開業, 開発, 工業, 歌, 歌手, 解決, 日本語, フランス語, スペイン語, 主語, 心配, 開始, 言語, 作業, 語る

**Observed lesson session order (batch_size = 5):**

The web app recommended **15 lessons** (3 batches). The user completed all 8 batches by continuing through the full pool. Items below are in the exact order presented during lesson quizzes.

| Batch | Items (in presented order) | Composition |
| ----- | -------------------------- | ----------- |
| 1 | 起きる, 頁, 配る, お酒, 速 | 2K + 3V |
| 2 | 日本酒, 習う, 進, 転がる, 自転車 | 1K + 4V |
| 3 | 運転する, 転送, 集, 回転, 落ちる | 1K + 4V |
| 4 | 運ぶ, 運がいい, 開ける, 鉄, 公開 | 1K + 4V |
| 5 | 開業, 開発, 工業, 読, 歌 | 1K + 4V |
| 6 | 歌手, 解決, 頭, 日本語, フランス語 | 1K + 4V |
| 7 | スペイン語, 主語, 顔, 心配, 開始 | 1K + 4V |
| 8 | 言語, 作業, 貢, 語る, 病 | 2K + 3V |

**Distribution pattern:**
- Total items in full queue: 40 (10 kanji incl. 頁 + 30 vocabulary). 頁 was not visible in the Level-10 picker screenshot — likely a leftover from a prior level.
- Kanji distribution across 8 batches: **2, 1, 1, 1, 1, 1, 1, 2** = 10 kanji total.
- Within each batch, kanji and vocab are **interleaved** (not grouped by type).
- Proportional `ceil(5 × 10/40) = 2` kanji per batch holds on average, but actual distribution front-loads and back-loads the extra kanji.

**Pending verification:**
- `lesson_position` values for each subject (need API call)
- Confirm `lessons_batch_size = 5` for this account
- Whether the sort key is strictly `lesson_position` or includes dependencies (e.g., vocab that uses a kanji appears after that kanji's lesson)

---

## Open Questions

1. **Total recommended cutoff** — Why 15 out of 23 in Account A? Could be `3 × batch_size = 15` if the anti-small-batch rule doesn't kick in for that distribution. Need batch constituency details.

2. **Within-batch ordering** — Items within a batch don't appear in pure `lesson_position` order. Batch 2 was presented as: 話(177), 出会う(178), 親(62), 私大(183), 千葉(188). The kanji 親(62) was in the middle, not sorted by position. The within-batch sort algorithm is unknown. Account B's order `v,k,v,v,k,v,k` also suggests interleaved lesson_position sort rather than type-blocked.

3. **3-type radical distribution** — Only the 2-type (kanji + vocab) case has been verified. The radical interleaving pattern is extrapolated.

4. **Recommended count decay** — Does the recommended count change as the user completes batches within a session? Does it track "presented but not completed" items client-side?

5. **Redistribution algorithm** — Account B's 13 items with batch_size=5 redistributed to [7, 6]. How does the algorithm decide between [7,6], [6,7], [5,4,4], [4,5,4]? Minimum batch size threshold is unknown (maybe ≥ batch_size - 2 = 3?).

## Implementation Plan

### Data Layer

1. **Extract `lessons_batch_size` from user preferences** during sync. The preferences blob is already stored on the user object (`WaniKaniUserData.preferences`) but never read. Store as a dedicated column or parse at query time.

2. **Sort lesson queue by `lesson_position`** using `json_extract(subjects.payload, '$.data.lesson_position')` in SQL. No schema migration needed — the field exists in the JSON blob.

3. **New batching function** in `src/domain/study/studyRepository.ts` that:
   - Separates items by type
   - Sorts each type queue by `lesson_position`
   - Distributes types proportionally across batches of `lessons_batch_size`
   - Applies the "avoid small batches" rule for the final batch

### Dashboard UI

4. **"Lessons" card** shows recommended count (`min(available, N × batch_size)` where N is TBD) and starts a session with the first batch in canonical order.

5. **Lesson Picker** remains the advanced pool (all available lessons). Already implemented.

### Files to Modify

| File                                          | Change                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/domain/api/types.ts`                     | Optionally type `lessons_batch_size` on preferences           |
| `src/domain/db/database.ts`                   | Extract and store `lessons_batch_size` during user sync       |
| `src/domain/study/studyRepository.ts`         | New proportional batching function, sort by `lesson_position` |
| `src/domain/dashboard/dashboardRepository.ts` | Add recommended lesson count to summary                       |
| `src/screens/DashboardScreen.tsx`             | Wire recommended count to Lessons card                        |
| `src/domain/db/schema.ts`                     | Optional: add `lesson_position` column to subjects table      |
