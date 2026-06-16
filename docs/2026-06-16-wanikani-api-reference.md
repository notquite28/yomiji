# WaniKani API Reference

Source: https://docs.api.wanikani.com/20170710/#introduction
Revision: 20170710
Fetched for Yomiji sync/offline reference.

## Authentication

- Every request must use HTTPS.
- Every request must include `Authorization: Bearer <api_token>`.
- Yomiji already uses the Bearer header in `src/domain/api/WaniKaniClient.ts`; do not reintroduce older token header formats.

## Revision header

- Include `Wanikani-Revision: 20170710` on all requests.
- The API defaults omitted revisions to the first revision, but Yomiji should keep sending the explicit header for stable response semantics.

## Response structures

- Resource shape: `id`, `object`, `url`, `data_updated_at`, `data`.
- Collection shape: `object`, `url`, `pages.next_url`, `pages.previous_url`, `pages.per_page`, `total_count`, `data_updated_at`, `data`.
- Collection `data_updated_at` is the newest timestamp in the requested scope and can be `null` when the scoped result is empty.

## Pagination

- Collections are cursor-paginated.
- Follow `pages.next_url` until it is `null`.
- Default page size is 500; `reviews` and `subjects` can have max 1,000.
- `total_count` is the count in scope, not just the current page.

## Filters

- Array query params are comma-delimited; single values are valid.
- `updated_after` is the primary cache refresh filter for collection endpoints.

## Errors

- Error body shape is `{ "error": string, "code": integer }` when present.
- Important statuses for Yomiji: `401`, `403`, `422`, `429`, `500`, `503`.
- Keep current behavior: auth errors clear stored token; `422` pending progress can be discarded only where the code already treats it as stale server rejection.

## Rate limit

- Limit is 60 requests per minute.
- A `429` response means rate limit exceeded.
- Response headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- `RateLimit-Reset` is epoch time in seconds and is a server timestamp; Yomiji must compare it using server-clock skew, not raw local `Date.now()`.

## Caching best practices

- Cache subjects aggressively.
- Assignments, review statistics, and study materials update moderately and should be incrementally refreshed.
- Summary changes hourly.
- Use `updated_after` to refresh only changed resources.

## Conditional request note

- API supports `If-None-Match` and `If-Modified-Since`, returning `304` when unchanged.
- Yomiji does not currently store ETags or Last-Modified; this is future reference only, not part of this implementation.

## Study materials

- Store user-specific notes and synonyms for one subject.
- `GET /study_materials` supports filters `hidden`, `ids`, `subject_ids`, `subject_types`, `updated_after`.
- `POST /study_materials` creates one record per `subject_id`; `subject_id` is required; `meaning_note`, `reading_note`, and `meaning_synonyms` are optional.
- `PUT /study_materials/<id>` updates a study material by id; `meaning_note`, `reading_note`, and `meaning_synonyms` are optional.
- Yomiji implication: omit untouched fields from pending update payloads; do not fill missing fields with `''` or `[]` before sending.

## Reviews and lessons

- `POST /reviews` sends `assignment_id`, incorrect answer counts, and optional `created_at`.
- `PUT /assignments/<id>/start` sends optional `started_at`; omitted defaults to request time; `started_at` must be at or after `unlocked_at`.
