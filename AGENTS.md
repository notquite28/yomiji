# AGENTS.md — 読路 (Yomiji)

## Commands

```bash
pnpm install                       # use pnpm; pnpm-lock.yaml is authoritative
pnpm start                         # expo start
pnpm android                       # expo start --android
pnpm ios                           # expo start --ios
pnpm typecheck                     # tsc --noEmit
pnpm test                          # jest --runInBand
pnpm test -- path/to/file.test.ts   # focused test file
pnpm exec expo install --check      # verify Expo SDK-compatible dependency versions
```

- There is no lint/formatter script in `package.json`; do not invent one.
- After code changes run `pnpm typecheck`; run `pnpm test -- <changed-area>.test.ts` when a matching test exists, otherwise run `pnpm test` for domain changes.
- Keep Jest at `~29.7.0`; Expo SDK 55 depends on that range.

## Source Of Truth

- `ROADMAP.md` tracks implementation status and known gaps.
- `REACT_NATIVE_PORT_PRD.md` is the product requirements document; older subdirectory PRD references are stale.
- `tsurukame/` is read-only Swift/UIKit reference code. Never import from it or modify it.

## Architecture

- Expo app entry is `App.tsx`; navigation, auth gate, and lifecycle sync live in `src/navigation/AppNavigator.tsx`.
- `src/domain/` is the pure logic layer; keep React/UI imports out of domain modules.
- Local SQLite is the primary data source after initial sync. Use `openAppDatabase()`; it returns the cached singleton connection.
- Sync is offline-first: pending writes flush before remote fetches, and incremental sync uses `updated_after` cursors in `sync_cursors`.
- Review and lesson progress must be queued locally before network submission. Pending review/lesson writes use `pending_progress`; study material edits use `pending_study_materials`.
- Lifecycle sync is intentionally conservative: foreground full sync only when stale (>15 min), background flush only if pending writes exist.

## TypeScript And Tests

- `strict` and `noUncheckedIndexedAccess` are enabled. Guard array/tuple indexing before use.
- Tests run under Node via `ts-jest` with `testMatch: ['**/*.test.ts']`; React Native runtime APIs need mocking or should stay out of unit-tested domain code.
- React Native has no `DOMException`; detect aborts with `error instanceof Error && error.name === 'AbortError'`.

## WaniKani Data Gotchas

- WaniKani radical `characters` can be `null`; store/render `characters ?? ''`. Do not fall back to `slug`, which leaks the answer on meaning prompts.
- Image-only radicals use `character_images`; prefer PNG where available and preserve SVG CSS fallback handling in `src/domain/subjects/radicalSvg.ts`.
- API `kana_vocabulary` objects are stored/rendered as local `vocabulary`; account for both names when reading API payloads or comparing subject types.
- Use `colorForSubjectType()` from `src/theme/subjectColors.ts`; do not duplicate subject-type color switches in screens.
- Study material sync must skip entries whose `subject_id` is absent locally rather than aborting the batch.
- Pending sync 422 responses mean stale/invalid local writes and are deleted with diagnostics; preserve this behavior.

## Database Constraints

- SQLite foreign keys are enforced. In cache resets, delete child tables before `subjects` (`assignments`, `study_materials`, `review_stats`, `audio_urls`, `subject_progress`, `pending_study_materials`).
- Full refresh must clear cached remote data and cursors without dropping pending local writes.

## Current Product Gaps

- Audio playback/offline audio, notifications/badges/deep links, custom fonts/font size, and related settings UI are scaffolded or pending.
- SRS browsing, remaining-item browsing, excluded vocabulary browsing, and several practice modes are not fully wired.
- Dashboard recommended lessons vs. advanced lesson-pool separation is still pending.
