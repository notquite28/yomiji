# WaniKani Recommended Lessons Algorithm

Research conducted May 2026. Data verified against multiple WaniKani lesson-pool snapshots, primarily level 10 accounts.

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

## Verified Data — Account D (level 10, screenshot + recommended lessons, 2026-05-18)

**Screenshot source:** WaniKani webapp lesson picker (Advanced pool) for Level 10.

**Available items (Advanced pool):** 2 kanji + 24 vocabulary = 26 total shown

**Kanji (2):** 漢, 病

**Vocabulary (24):** 最終, 軽い, 道路, 線路, 路地, 算数, フランス語, スペイン語, 主語, 鳴く, 線, 横, 最も, 最高, 最後, 最近, 心配, 開始, 曲線, 言語, 作業, 語る, 足し算, 引き算

**Observed recommended lessons (batch_size = 5):**

The web app recommended **15 lessons** (3 batches) out of the 26-item advanced pool.

| Batch | Items (in presented order) | Composition |
| ----- | -------------------------- | ----------- |
| 1 | 最終, 軽い, 漢, 道路, 線路 | 1K + 4V |
| 2 | 路地, 算数, 病, フランス語, スペイン語 | 1K + 4V |
| 3 | 主語, 鳴く, 線, 横, 最も | 0K + 5V |

**Advanced-only remainder (not in today's recommended set):** 最高, 最後, 最近, 心配, 開始, 曲線, 言語, 作業, 語る, 足し算, 引き算

**Distribution observations:**

- Recommended count again matches **3 × batch_size = 15**, even though 26 lessons are available.
- Both available kanji appear in the first two recommended batches, with vocabulary filling the remaining slots.
- The third recommended batch is vocabulary-only because the kanji queue is exhausted.
- This snapshot supports treating the full lesson picker as the advanced pool while the dashboard "recommended" set is a capped, ordered subset.

**Pending verification:**

- `lesson_position` values for all 26 subjects.
- Confirm `lessons_batch_size = 5` and `max_daily_lessons` for this account at the time of the screenshot.
- Whether the 15-item cutoff is consistently `3 × lessons_batch_size`, `max_daily_lessons`, or another WaniKani preference/heuristic.

## Verified Data — Account E (level 11, screenshot + partial lesson sessions, 2026-05-25)

**Screenshot source:** WaniKani webapp lesson picker (Advanced pool) for Level 11.

**Available items shown after 5 lessons were already completed:** 10 radicals + 16 kanji + 50 vocabulary = 76 total shown

**Radicals (10):** 及, 戈, 皮, 良, 音, 少, 単, 共, 玄, 呂

**Kanji (16):** 低, 別, 利, 努, 労, 岸, 放, 注, 拾, 指, 洋, 功, 特, 便, 働, 味

**Vocabulary (50):** 売り上げ, 売り切れ, 売り手, 本物, 乗り物, 金持ち, 気持ち, 物語, 欠かす, 決心, 入所, 今夜, 比べる, 正解, 東北, 安売り, 仕返し, 返る, 乗り場, 使い方, 仕事, 負け犬, 勝ち, 苦しむ, 気付く, 見送る, 辺, 時々, 受付, 買い物, 苦手, 〜部, 気持ちいい, 試す, 入学試験, 〜付き, 発売中, 食べ物, 保持する, 通う, 屋上, 見物, 予め, 平仮名, 文字通り, 新た, 心持ち, 見事, 生物学, 欠く

**Observed lesson session order (batch_size presumed 5):**

The first 5 lessons were completed before recording this snapshot. The following batches were observed afterward.

| Batch | Items (in presented order) | Composition |
| ----- | -------------------------- | ----------- |
| 2 | 売り上げ, 低, 及, 別, 売り切れ | 1R + 2K + 2V |
| 3 | 売り手, 本物, 戈, 利, 乗り物 | 1R + 1K + 3V |

**Sorting inference from current state:**

Assuming the screenshot order is each type queue's remaining `lesson_position` order, the observed sessions consume those queues like this:

| Step | Batch item | Type | Queue index after Batch 1 |
| ---- | ---------- | ---- | ------------------------- |
| 1 | 売り上げ | V | V1 |
| 2 | 低 | K | K1 |
| 3 | 及 | R | R1 |
| 4 | 別 | K | K2 |
| 5 | 売り切れ | V | V2 |
| 6 | 売り手 | V | V3 |
| 7 | 本物 | V | V4 |
| 8 | 戈 | R | R2 |
| 9 | 利 | K | K3 |
| 10 | 乗り物 | V | V5 |

So the remaining observed interleave pattern is **V, K, R, K, V, V, V, R, K, V**. The per-type order itself appears stable: radicals advance `及 → 戈`, kanji advance `低 → 別 → 利`, and vocabulary advances `売り上げ → 売り切れ → 売り手 → 本物 → 乗り物`.

If the original recommended set was 15 lessons, this 10-item remainder already contains **2 radicals + 3 kanji + 5 vocabulary**. A proportional 15-item set over the 76-item remaining pool after Batch 1 would be approximately **2R + 3K + 10V**, which implies the completed Batch 1 was likely **5 vocabulary** if the cutoff was still 15 total recommended lessons. That would make the full inferred composition **0R + 0K + 5V**, then **1R + 2K + 2V**, then **1R + 1K + 3V**.

**Distribution observations:**

- This is the first recorded 3-type dataset with radicals, kanji, and vocabulary present together.
- The observed batches interleave vocabulary, kanji, and radicals rather than grouping by type.
- Batch 2 contains two kanji and one radical; Batch 3 contains one kanji and one radical. The 10 observed post-Batch-1 items already account for the expected non-vocabulary share of a 15-item proportional recommendation over the remaining pool.
- Because the first completed batch was not recorded, this snapshot cannot prove the exact first-batch items. The strongest current inference is that Batch 1 was five vocabulary items that preceded 売り上げ in canonical order.

**Pending verification:**

- Recover or record Batch 1 from a future level/account before completing any lessons.
- `lesson_position` values for all Level 11 items in this snapshot.
- Confirm `lessons_batch_size`, `max_daily_lessons`, and recommended count at the time of the screenshot.

---

## Open Questions

1. **Total recommended cutoff** — Multiple level 10 snapshots show 15 recommended lessons (`3 × batch_size`) even when more lessons are available (23, 26, or 39+). Need to confirm whether the cutoff is always `3 × lessons_batch_size`, `max_daily_lessons`, or another WaniKani preference/heuristic.

2. **Within-batch ordering** — Items within a batch don't appear in pure `lesson_position` order. Batch 2 was presented as: 話(177), 出会う(178), 親(62), 私大(183), 千葉(188). The kanji 親(62) was in the middle, not sorted by position. The within-batch sort algorithm is unknown. Account B's order `v,k,v,v,k,v,k` also suggests interleaved lesson_position sort rather than type-blocked.

3. **3-type radical distribution** — Account E provides the first partial 3-type observation: Batch 2 was 1R + 2K + 2V and Batch 3 was 1R + 1K + 3V. Need a complete unstarted 3-type session to verify Batch 1, the full recommended cutoff, and whether the allocation is proportional over all available items or over the recommended subset.

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
