# WaniKani API v2 Overview

**Executive Summary:** The WaniKani REST API v2 provides programmatic access to a user’s WaniKani data (assignments, levels, study materials, etc.) as well as general reference data (subjects, SRS systems, voice actors). Authentication is via a user-specific API token sent in an `Authorization: Bearer <token>` header【42†L134-L142】 (with each request also including `Wanikani-Revision: YYYYMMDD`, default 20170710【47†L380-L386】). Endpoints fall into two categories: *collections* (GET lists with optional filters) and *resources* (GET by ID), with some supporting POST/PUT for actions (e.g. starting assignments, submitting reviews, updating study materials, or updating user preferences). All responses are JSON. Collection responses include a `pages` object with cursor-based pagination (`next_url`/`page_after_id`)【42†L235-L242】【42†L254-L262】. Rate limits are 60 requests/minute; exceeding yields HTTP 429 with rate-limit headers to guide retries【47†L329-L338】【47†L337-L341】. Error responses use standard HTTP codes (e.g. 401/403/404/429) and JSON bodies of form `{"error":...,"code":...}`【47†L301-L309】【47†L313-L319】. The API does **not** offer webhooks. Versioning is by **revision headers** – breaking changes get a new date revision【47†L371-L380】, non-breaking changes appear in all versions (the header defaults to the initial 20170710 revision【47†L380-L386】). Cross-Origin support is enabled (CORS on)【42†L90-L94】, so React Native `fetch`/`axios` calls work fine. 

For React Native, use standard HTTP libraries (`fetch` or `axios`), include both headers, and handle networking similarly as on web. Store the token securely (e.g. Android Keystore/Encrypted SharedPreferences or libraries like `react-native-keychain`, *not* plain `AsyncStorage`). Respect user subscription limits: free users have max level 3, paid up to 60【50†L591-L600】 – do not attempt to access higher-level content or submit lessons/reviews beyond that. For offline/sync, cache static data (e.g. subjects) aggressively and use `updated_after` filters to fetch deltas. Conditionally GET using `If-None-Match`/`If-Modified-Since` and use `ETag`/`Last-Modified` headers to minimize bandwidth and enable offline mode【47†L438-L447】. Tsurukame-like apps should maintain a local DB of assignments, study materials, etc., and batch-post any offline user reviews once online.

Below is a structured summary covering each dimension.

## Authentication 
- **Token:** Obtain a **v2 API token** on WaniKani account Settings (API Tokens). The token is a static secret, scoped by your selection of permissions (e.g. **read** vs **write** privileges on creation). Mobile apps must include **write** permission to submit reviews/lessons (without it, POST endpoints will be forbidden)【38†L25-L34】.
- **Header:** Every request must include `Authorization: Bearer <api_token>` over HTTPS【42†L134-L142】. Also include `Wanikani-Revision: YYYYMMDD` header to lock API revision. If omitted, the server defaults to revision `20170710`【47†L380-L386】.
- **No OAuth flow:** WaniKani uses a simple token scheme (no OAuth redirect). The app must let the user paste their token or use an in-app OAuth redirect (if implemented separately by WaniKani). Once obtained, store it securely.

```bash
# Example (curl): GET user information
curl "https://api.wanikani.com/v2/user" \
  -H "Authorization: Bearer <api_token>" \
  -H "Wanikani-Revision: 20170710"
```

```js
// Example (React Native fetch):
const apiToken = '<api_token>';
fetch('https://api.wanikani.com/v2/user', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiToken}`,
    'Wanikani-Revision': '20170710'
  }
})
  .then(res => res.json())
  .then(json => console.log(json));
```

## Endpoints and Methods 
The API is organized by **resources**. Below are the main endpoints (base path `https://api.wanikani.com/v2/`) with their HTTP methods:

- **Assignments** (`/assignments`):  
  - **GET** `/assignments` – List all assignments for the authenticated user (with optional query filters: e.g. `levels`, `srs_stages`, `available_after`, `hidden`, `subject_ids`, etc.)【22†L809-L818】.  
  - **GET** `/assignments/{id}` – Get one assignment by ID【22†L866-L874】.  
  - **PUT** `/assignments/{id}/start` – Mark an assignment as started (e.g. at lesson completion) by sending `{"assignment":{"started_at":<timestamp>}}`【22†L930-L939】. Returns the updated assignment.
- **Level Progressions** (`/level_progressions`):  
  - **GET** `/level_progressions` – List level progression records (filters: e.g. `ids`, `updated_after`)【24†L1138-L1147】.  
  - **GET** `/level_progressions/{id}` – Get one level progression by ID【24†L1152-L1160】.
- **Resets** (`/resets`):  
  - **GET** `/resets` – List account reset records (filters: `ids`, `updated_after`)【24†L1243-L1251】.  
  - **GET** `/resets/{id}` – Get a specific reset by ID【25†L1312-L1320】.
- **Reviews** (`/reviews`): *Note:* The **GET** endpoints are deprecated (they return no data or 404)【25†L1430-L1438】【12†L1509-L1514】. Only **POST** is used:  
  - **POST** `/reviews` – Submit a review result when a user answers a quiz. Body: `{"review": {"assignment_id":<int>,"incorrect_meaning_answers":<int>,"incorrect_reading_answers":<int>,"created_at":<ISO8601>}}`. Either `assignment_id` or `subject_id` is required (assignment_id preferred)【27†L1566-L1574】【27†L1648-L1656】. On success returns an unpersisted review object (id=0) and **resources_updated** containing the updated assignment and review_statistic (to integrate into client’s state)【27†L1566-L1574】【27†L1648-L1656】.
- **Review Statistics** (`/review_statistics`):  
  - **GET** `/review_statistics` – List statistics of reviews by subject (filters: `subject_ids`, `subject_types`, `hidden`, `percentages_greater_than/less_than`, etc.)【29†L1805-L1814】.  
  - **GET** `/review_statistics/{id}` – Get one review statistic record by ID【29†L1823-L1830】.
- **Spaced Repetition Systems** (`/spaced_repetition_systems`):  
  - **GET** `/spaced_repetition_systems` – List all SRS configurations (500 per page)【31†L2015-L2023】.  
  - **GET** `/spaced_repetition_systems/{id}` – Get one system by ID (includes full stage intervals)【32†L2209-L2217】.
- **Study Materials** (`/study_materials`):  
  - **GET** `/study_materials` – List user’s study material notes (filters: `subject_ids`, `subject_types`, `hidden`, `updated_after`)【33†L2389-L2398】.  
  - **GET** `/study_materials/{id}` – Get one study material by ID【33†L2417-L2425】.  
  - **POST** `/study_materials` – Create a new study material for a subject: JSON body `{"study_material":{"subject_id":<int>,"meaning_note":<str>,"reading_note":<str>,"meaning_synonyms":[...]}}`. The owner can create at most one per subject【34†L2520-L2528】【34†L2536-L2544】.  
  - **PUT** `/study_materials/{id}` – Update an existing study material by ID (fields same as POST, all optional)【34†L2599-L2607】.
- **Subjects** (`/subjects`):  
  - **GET** `/subjects` – List WaniKani’s dictionary of subjects (radical, kanji, vocabulary). Supports filters: `ids`, `types`, `levels`, `slugs`, `hidden`, `updated_after`【17†L3344-L3352】. (Max 1000 per page.)  
  - **GET** `/subjects/{id}` – Get one subject by ID (the `data` structure differs by `object`: radical/kanji/vocabulary)【17†L3356-L3363】.
- **Summary** (`/summary`):  
  - **GET** `/summary` – Get the user’s dashboard summary (available lessons, reviews by hour)【18†L37-L45】.
- **User** (`/user`):  
  - **GET** `/user` – Get current user’s profile (id, username, level, subscription info, preferences)【19†L3512-L3521】【19†L3529-L3539】.  
  - **PUT** `/user` – Update user preferences. Send JSON `{"user":{"preferences":{…}}}` with any of the allowed prefs (`lessons_autoplay_audio`, `lessons_batch_size`, `reviews_autoplay_audio`, `reviews_display_srs_indicator`, `reviews_presentation_order`)【20†L3703-L3712】【20†L3741-L3750】.
- **Voice Actors** (`/voice_actors`):  
  - **GET** `/voice_actors` – List available voice actors (e.g. for vocabulary audio)【21†L3831-L3839】.  
  - **GET** `/voice_actors/{id}` – Get one voice actor by ID【21†L3849-L3858】.

Each endpoint’s *data* payload has a common structure: a top-level `"data"` object (for resources) or array (in collections) containing the fields. For example, an Assignment resource’s `data` includes `subject_id`, `srs_stage`, `unlocked_at`, `started_at`, `passed_at`, `burned_at`, etc.【22†L891-L900】. A Study Material has `meaning_note`, `reading_note`, `meaning_synonyms`, etc.【33†L2371-L2377】. The User resource includes `level`, `started_at`, and a `subscription` object with fields like `active`, `type`, and `max_level_granted`【19†L3522-L3530】【50†L591-L600】.

## Request/Response Schemas

All responses are JSON. **Resource** endpoints return an object like:
```
{
  "id": <integer>,
  "object": <string>,
  "url": <string>,
  "data_updated_at": <timestamp>,
  "data": { … resource-specific fields … }
}
```  
**Collection** endpoints return:
```
{
  "object": "collection",
  "url": <string>,
  "pages": {
    "per_page": <integer>,
    "next_url": <string|null>,
    "previous_url": <string|null>
  },
  "total_count": <integer>,
  "data_updated_at": <timestamp|null>,
  "data": [ … list of resource objects … ]
}
```
【42†L159-L168】【42†L169-L178】. Key points:
- Common attributes: `object` (type of resource), `url` (self-URL), `data_updated_at` (last-modified for this resource or collection), and `data` (fields or array).  
- All dates are ISO-8601 (UTC, microsecond precision)【42†L228-L234】.
- Subjects, Assignments, etc. each have their own fields. (See examples above.)  
- The User’s `data.subscription.max_level_granted` (3 or 60) indicates what content levels the user can access【50†L591-L600】. 

Example (abridged) **Assignment** resource:
```
{
  "id": 80463006,
  "object": "assignment",
  "data": {
    "subject_id": 8761,
    "subject_type": "radical",
    "srs_stage": 8,
    "unlocked_at": "2017-09-05T23:38:10.695133Z",
    "started_at": "2017-09-05T23:41:28.980679Z",
    "passed_at": "2017-09-07T17:14:14.491889Z",
    "burned_at": null,
    "resurrected_at": null
  }
}
```
(See 【22†L891-L900】 for a full example response.)

## Pagination

By default, collections return up to 500 items per page (subjects and reviews up to 1000)【42†L235-L242】. If more results exist, the JSON includes `pages.next_url`. You page through results by repeatedly GET-ing the `next_url`. Each page also has `pages.previous_url` and `pages.per_page`【42†L235-L242】【42†L254-L262】.

**Cursor-based paging:** Instead of numeric pages, WaniKani uses the last `id` as the cursor. You can also use `page_after_id=<last_id>` or `page_before_id=<first_id>` as query params to get subsequent or previous pages. If `next_url` is `null`, you’ve reached the end.

> **Mermaid Diagram – Pagination Flow:**  
> ```mermaid
> graph LR
>   A[Fetch page 1 of /subjects] --> B{“next_url” in response?}
>   B -- Yes --> C[Fetch using next_url]
>   C --> B
>   B -- No --> D[Done, combined all pages]
> ```
> Use the `data` arrays from each page to aggregate results client-side. For example, to fetch all subjects: keep requesting `/subjects?page_after_id=<last_seen_id>` until `next_url` is null.

Code snippet (JavaScript async using fetch):
```js
async function fetchAllSubjects(apiToken) {
  let all = [];
  let url = 'https://api.wanikani.com/v2/subjects';
  const headers = { 
    'Authorization': `Bearer ${apiToken}`, 
    'Wanikani-Revision': '20170710' 
  };
  while (url) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    all.push(...json.data);
    url = json.pages.next_url;  // null when done
  }
  return all;
}
```

## Rate Limits and Retries

WaniKani enforces **60 requests per minute** per token【47†L329-L338】. On exceeding, the API returns HTTP 429 with body `{"error":"Rate Limit Exceeded","code":429}`【47†L329-L338】. The response headers include:
- `RateLimit-Limit`: request limit per minute (60)  
- `RateLimit-Remaining`: remaining requests in this window  
- `RateLimit-Reset`: epoch-second timestamp when the window resets【47†L337-L341】.  

An app should watch `RateLimit-Remaining` and gracefully handle 429 (e.g. back off). Example retry logic (ES2017):

```js
async function fetchWithRateLimit(url, options) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const reset = res.headers.get('RateLimit-Reset');
    const waitMs = reset ? (parseInt(reset)*1000 - Date.now()) : 60000;
    await new Promise(r => setTimeout(r, waitMs));  // wait until reset
  }
  throw new Error('Rate limited, retry count exceeded');
}
```

(Note: Mobile network requests can be slow; consider retries with exponential backoff if needed.)

## Error Handling

Standard HTTP statuses are used:
- **200** Success  
- **401 Unauthorized:** Missing/invalid token (“Unauthorized. Nice try.”)【47†L315-L322】.  
- **403 Forbidden:** Valid token but insufficient scope/permission (e.g. trying to write on a read-only token, or violating subscription limits).  
- **404 Not Found:** Resource does not exist or not accessible.  
- **409 Conflict:** Resource conflict (rare).  
- **422 Unprocessable Entity:** Invalid request body (malformed JSON or out-of-range values)【47†L317-L322】.  
- **429 Too Many Requests:** Rate limit exceeded【47†L329-L338】.  
- **500/503 Server Error:** WaniKani backend issue.

Error **response format** (JSON) is:
```json
{ "error": "<message>", "code": <HTTP status> }
```
【47†L301-L309】【47†L313-L319】. E.g. 401 returns `{"error": "Unauthorized. Nice try.","code":401}`. Always check `res.ok` or status, and handle accordingly (e.g. show message to user or retry). 

## Webhooks

WaniKani’s official API **does not** provide real-time webhooks or push notifications. Integrations poll the API periodically to detect new reviews or lessons. (Some users build their own wrappers that call the API and then forward events to services like Discord.) For Android, you may use background fetch at intervals or FCM push (triggered from your own server) if needed. But out-of-the-box, only pull-based access exists.

## Versioning and Deprecation

The API uses **revision headers** for versioning. The current documented revision is `20170710`. When WaniKani makes breaking changes, they publish a new revision (date) and clients should use the matching header. Non-breaking changes (new fields/endpoints) are visible under all revisions【47†L371-L380】.

- **Wanikani-Revision header:** Must be sent in all requests, e.g. `Wanikani-Revision: 20170710`. This fixes the API schema. If omitted, the server assumes the first (20170710) revision【47†L380-L386】.
- **Non-breaking changes:** e.g., adding new output fields or endpoints. (E.g. `/spaced_repetition_systems` was added later without bumping the revision number while in beta【31†L2015-L2023】.)
- **Deprecated endpoints:** The GET `/reviews` and GET `/reviews/{id}` are deprecated (they return empty/404)【25†L1430-L1438】【12†L1509-L1514】; do not use them. In user preferences, some fields (like `default_voice_actor_id`) are deprecated and read-only【21†L3818-L3826】.
- **Revisions usage:** Always include the revision header to avoid unexpected changes. Monitor WaniKani announcements for API updates.

## CORS and React Native Considerations

WaniKani enables CORS for all endpoints【42†L90-L94】, which means browser-based clients can fetch directly. React Native is not subject to same-origin CORS restrictions (it can call any HTTPS API). You still must use HTTPS and include the headers as above. 

- **Fetch/Axios:** Standard JS `fetch` works, and `axios` or other libraries are fine. Ensure the headers (`Authorization`, `Wanikani-Revision`, `Content-Type: application/json`) are set correctly.
- **Timeouts:** Mobile networks can be unreliable; consider adding timeouts/retries on network requests.
- **SSL Certificates:** WaniKani uses valid SSL (no self-signed cert), so default RN HTTPS handling works.

## Security: Storing Tokens

Treat the API token as sensitive. On Android, **do not store** it in plaintext or in version control. Options include:
- **Android KeyStore / EncryptedSharedPreferences:** Android Jetpack Security provides encrypted prefs tied to the device credential. 
- **AccountManager:** Android’s AccountManager with a custom authenticator (complex, usually overkill).
- **React Native libraries:** e.g. [`react-native-keychain`](https://github.com/oblador/react-native-keychain) or [`react-native-sensitive-info`](https://github.com/mCodex/react-native-sensitive-info) to securely store secrets.

Similarly on iOS, use Keychain (libraries like `react-native-keychain` handle both). Always encrypt and never log the token. On logout, clear it.

## Offline Caching and Sync

For good UX (like Tsurukame’s offline mode), cache as much as possible:
- **Static data:** Subjects, SRS systems, voice actors – these rarely change. Fetch once and store (e.g. SQLite, async storage). Then reuse offline【47†L400-L409】.
- **Incremental sync:** On app launch or resume, use `updated_after` filters to get only changed items since last sync (supported on most endpoints: assignments, study_materials, review_statistics, resets, etc.). This avoids re-downloading everything【47†L438-L447】.
- **Conditional requests:** Use `If-None-Match` / `If-Modified-Since` with the `ETag` or `Last-Modified` from previous responses. The server returns 304 if no change, saving bandwidth【47†L438-L447】.
- **Local DB:** Store assignments, review statistics, study materials locally. When user studies offline, queue any POST `/reviews` calls or study material PUTs, then flush when online.
- **Summary caching:** The summary report changes hourly; you may cache it for up to an hour for offline use (it’s not mission-critical).
- **Cache duration:** Subjects – long-term; reviews/resets – append-only (never change once recorded); assignments & review_stats – update frequently at level changes but level-by-level (per WaniKani rules)【47†L410-L419】.

> *Tip:* Use the `pages.per_page` and `total_count` fields to gauge remaining items and progress of pagination; showing a sync progress indicator can help UX.

## Example Requests and Code Snippets

Below are example calls in **curl** and **JavaScript** (fetch/axios) for common tasks:

- **Get Current User (GET /user):**  
  - *Curl:*  
    ```bash
    curl "https://api.wanikani.com/v2/user" \
      -H "Authorization: Bearer <api_token>" \
      -H "Wanikani-Revision: 20170710"
    ```
  - *JS (fetch):*  
    ```js
    fetch('https://api.wanikani.com/v2/user', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Wanikani-Revision': '20170710' }
    })
      .then(res => res.json())
      .then(data => console.log(data.data.username, data.data.level));
    ```
- **List All Assignments (GET /assignments):**  
  - *Curl:*  
    ```bash
    curl "https://api.wanikani.com/v2/assignments?levels=5&subject_types=kanji,kana_vocabulary" \
      -H "Authorization: Bearer <api_token>" -H "Wanikani-Revision: 20170710"
    ```
  - *JS (fetch):*  
    ```js
    const url = 'https://api.wanikani.com/v2/assignments?levels=5&subject_types=kanji,kana_vocabulary';
    fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}`, 'Wanikani-Revision': '20170710' } })
      .then(res => res.json()).then(json => console.log(json.data));
    ```
- **Start an Assignment (PUT /assignments/{id}/start):**  
  - *Curl:* (body requires `started_at`, use current time or from assignment)  
    ```bash
    curl -X PUT "https://api.wanikani.com/v2/assignments/12345/start" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer <api_token>" \
      -H "Wanikani-Revision: 20170710" \
      -d '{"assignment":{"started_at":"2023-05-10T08:00:00.000000Z"}}'
    ```
  - *JS (fetch):*  
    ```js
    fetch('https://api.wanikani.com/v2/assignments/12345/start', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Wanikani-Revision': '20170710', 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment: { started_at: new Date().toISOString() } })
    }).then(res => res.json()).then(data => console.log(data));
    ```
- **Create a Review (POST /reviews):** (submit quiz answers)  
  - *Curl:*  
    ```bash
    curl -X POST "https://api.wanikani.com/v2/reviews" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer <api_token>" \
      -H "Wanikani-Revision: 20170710" \
      -d '{
           "review": {
             "assignment_id": 1422,
             "incorrect_meaning_answers": 1,
             "incorrect_reading_answers": 2,
             "created_at": "2023-05-10T09:15:00.000000Z"
           }
         }'
    ```
  - *JS (fetch):*  
    ```js
    fetch('https://api.wanikani.com/v2/reviews', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Wanikani-Revision': '20170710', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review: {
          assignment_id: 1422,
          incorrect_meaning_answers: 1,
          incorrect_reading_answers: 2,
          created_at: new Date().toISOString()
        }
      })
    })
    .then(res => res.json())
    .then(json => {
      // json.data contains the review, json.resources_updated has assignment and review_statistic
      console.log(json.resources_updated.assignment.data.srs_stage);
    });
    ```
- **Update Study Material (PUT /study_materials/{id}):**  
  ```js
  axios.put('https://api.wanikani.com/v2/study_materials/234', {
    study_material: {
      meaning_note: "New meaning note",
      reading_note: "New reading note"
    }
  }, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Wanikani-Revision': '20170710',
      'Content-Type': 'application/json'
    }
  }).then(res => console.log(res.data));
  ```
- **Handle Pagination:** (see code snippet in *Pagination* section above.)

## Endpoint Summary Table

| Resource             | Purpose                        | Method | Path (relative)             | Required Params    | Key Response Fields                |
|----------------------|--------------------------------|--------|-----------------------------|--------------------|------------------------------------|
| **Assignments**      | User’s assignments (SRS state) | GET    | `/assignments`              | *none (optional filters)* | `data.id`, `subject_id`, `subject_type`, `level`, `srs_stage`, `unlocked_at`, `started_at`, `passed_at`, `burned_at`, `available_at`【22†L891-L900】 |
|                      | **(single)**                   | GET    | `/assignments/{id}`         | `id`              | Same as above (one record)       |
|                      | Start an assignment            | PUT    | `/assignments/{id}/start`   | `id`; JSON body `assignment.started_at` | Updated assignment data         |
| **LevelProgression** | User’s level progress records  | GET    | `/level_progressions`       | *none (filters: ids, updated_after)* | `data.level`, `unlocked_at`, `started_at`, `passed_at`, `completed_at`【24†L1177-L1185】 |
|                      | **(single)**                   | GET    | `/level_progressions/{id}`  | `id`              | Same as above (one record)       |
| **Resets**           | User’s reset history           | GET    | `/resets`                   | *none (filters: ids, updated_after)* | `data.original_level`, `target_level`, `created_at`, `confirmed_at`【24†L1223-L1232】 |
|                      | **(single)**                   | GET    | `/resets/{id}`              | `id`              | Same as above (one record)       |
| **Reviews**          | (Deprecated) get review logs   | GET    | `/reviews`                  | —                  | *Empty array always*【25†L1430-L1438】 |
|                      | **(single)** (deprecated)      | GET    | `/reviews/{id}`             | `id`              | *404 error*【12†L1509-L1514】      |
|                      | Submit a review               | POST   | `/reviews`                  | JSON: `assignment_id` or `subject_id`, `incorrect_meaning_answers`, `incorrect_reading_answers`【27†L1648-L1656】, optional `created_at` | Returns review data and nested `resources_updated.assignment`, `resources_updated.review_statistic`【27†L1566-L1574】 |
| **ReviewStatistics** | Stats for each subject (answers count) | GET    | `/review_statistics`        | *none (filters: subject_ids, percentages, hidden, etc.)* | `data.subject_id`, `meaning_correct`, `meaning_incorrect`, `reading_correct`, `reading_incorrect`, `meaning_current_streak`, `reading_current_streak`, `percentage_correct`【29†L1759-L1767】【29†L1850-L1859】 |
|                      | **(single)**                   | GET    | `/review_statistics/{id}`   | `id`              | Same as above (one record)       |
| **SRS Systems**      | Spaced repetition system info  | GET    | `/spaced_repetition_systems` | *none (filters: ids, updated_after)* | `data.name`, `description`, `unlocking_stage_position`, `starting_stage_position`, `passing_stage_position`, `burning_stage_position`, `stages[]` (intervals)【31†L2032-L2040】 |
|                      | **(single)**                   | GET    | `/spaced_repetition_systems/{id}` | `id`         | Same as above (one record)       |
| **StudyMaterials**   | User notes/synonyms per subject | GET    | `/study_materials`         | *none (filters: subject_ids, subject_types, updated_after, hidden)* | `data.subject_id`, `meaning_note`, `reading_note`, `meaning_synonyms[]`【33†L2371-L2377】 |
|                      | **(single)**                   | GET    | `/study_materials/{id}`     | `id`              | Same as above (one record)       |
|                      | Create material                | POST   | `/study_materials`         | JSON: `subject_id` (required), optional `meaning_note`, `reading_note`, `meaning_synonyms`【34†L2542-L2549】 | Created study_material resource  |
|                      | Update material                | PUT    | `/study_materials/{id}`     | `id`, JSON: any of `meaning_note`, `reading_note`, `meaning_synonyms`【34†L2618-L2625】 | Updated study_material resource  |
| **Subjects**         | WK dictionary entries          | GET    | `/subjects`                | *none (filters: ids, types, levels, slugs, hidden, updated_after)* | Subject data (type-specific): e.g. radicals have `meaning`/`mnemonic`; kanji have `meanings`, `readings`, `component_subject_ids`, etc【17†L3256-L3264】 |
|                      | **(single)**                   | GET    | `/subjects/{id}`            | `id`              | Same as above (one subject)      |
| **Summary**          | Dashboard summary (lessons & reviews upcoming) | GET | `/summary` | — | `data.lessons[]`, `data.reviews[]` grouped by hour【18†L31-L39】 |
| **User**             | User profile & settings        | GET    | `/user`                    | —                  | `data.username`, `level`, `started_at`, `preferences` and `subscription` info【19†L3512-L3520】【50†L591-L600】 |
|                      | Update preferences             | PUT    | `/user`                    | JSON: any of `preferences.extra_study_autoplay_audio`, `lessons_autoplay_audio`, `lessons_batch_size`, `reviews_autoplay_audio`, `reviews_display_srs_indicator`, `reviews_presentation_order`【20†L3741-L3750】 | Updated user object             |
| **VoiceActors**      | Available voice actor options  | GET    | `/voice_actors`           | *none (filters: ids, updated_after)* | `data.id`, `name`, `gender`, `description`【21†L3823-L3831】 |
|                      | **(single)**                   | GET    | `/voice_actors/{id}`        | `id`              | Same as above (one record)       |

*(Fields in the “Key Response Fields” column are illustrative; see documentation for full schemas.)* 

## Ambiguities, Gaps, and Pitfalls

- **Documentation Currency:** The doc revision is dated 2017, but WaniKani made changes afterward (e.g. added `/spaced_repetition_systems`, new SRS stages, additional subject fields). The GitHub indicates minor fixes post-2017【45†L21-L29】. Test endpoints against the actual API in case newer fields or behavior exist.
- **Scope/Permissions:** Ensure the API token has correct scopes. A read-only token cannot POST reviews. If using a third-party token UI, the user must explicitly grant “write” permission for lessons/reviews【38†L25-L34】.
- **Subscription Limits:** If a user’s `subscription.max_level_granted` = 3, do not fetch or attempt to create content above level 3 (requests for higher items will be empty or rejected). The API enforces this at submission time【50†L591-L600】.
- **Deprecated Review GETs:** Ignore GET `/reviews`; it will always be empty or 404【25†L1430-L1438】【12†L1509-L1514】. Only use POST `/reviews`.
- **Token Refresh:** There is no token refresh – if a token is revoked or user logs out, all calls will 401. Prompt user to re-enter token in that case.
- **Time Zones:** All timestamps in WaniKani are UTC. Be careful if converting to local time.
- **Field Changes:** Some fields (like `lessons_presentation_order`, `default_voice_actor_id`) are present but deprecated and unchangeable【20†L3723-L3732】【21†L3818-L3826】. Don’t rely on changing them.
- **Quota per token:** The 60/min limit is per token per IP. If multiple devices use the same token, they share the limit.
- **Error 500/503:** Rare but possible if WaniKani servers are busy. Implement retries for 503 (e.g. try after a few seconds).
- **CORS and Mobile:** While CORS is allowed, ensure your app’s network security config allows the WaniKani domain. On Android 9+, cleartext HTTP is blocked by default, but WaniKani is HTTPS so it’s fine.
- **Conditional Headers:** The docs encourage using `If-Modified-Since`/`If-None-Match`【47†L438-L447】, but many mobile devs rarely use them. It’s optional for performance; rely on `updated_after` filters first.
- **No Webhooks:** Features like auto-push of new reviews are unavailable; mobile apps (like Tsurukame) historically poll frequently or rely on background sync.

## LLM Prompt Templates

Use the following example prompts to guide an LLM (e.g. ChatGPT) in generating code or tests for WaniKani API clients:

- **Fetch Data:**  
  *Prompt:* `"Write a React Native function that uses fetch to retrieve the current user's WaniKani profile via GET /user. Include required headers (Authorization and Wanikani-Revision) and return the JSON result."`  
- **POST Review:**  
  *Prompt:* `"In JavaScript, send a POST request to WaniKani /reviews to submit a review for assignment 1234 with 0 incorrect answers. Include error handling for HTTP status codes 429 (rate limit) and 401 (unauthorized)."`  
- **Pagination Logic:**  
  *Prompt:* `"Implement an async function in JavaScript that fetches all pages of WaniKani /subjects, handling pagination via the 'next_url' field until no more pages, then returns the combined array of subjects."`  
- **Retry Logic:**  
  *Prompt:* `"Write a fetch wrapper function that retries up to 3 times if a WaniKani API call returns 429, waiting until the 'RateLimit-Reset' time before retrying. Use async/await."`  
- **Unit Test:**  
  *Prompt:* `"Using Jest, write a unit test for a function `parseAssignments(json)` which accepts a WaniKani assignments JSON response and returns an array of `{id, subject_id, level, srs_stage}`. Mock a sample JSON input and assert the parsed output."`  

These prompts should yield code that includes the correct endpoints, headers, and response handling.

