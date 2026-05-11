# Yomichi (読み道)

A WaniKani study app for Android, built with React Native and Expo. Named for 読み (reading) + 道 (path): the path of reading.

The original Tsurukame iOS app in `tsurukame/` remains the behavior reference. See `ROADMAP.md` for the parity checklist and `tsurukame/REACT_NATIVE_PORT_PRD.md` for product requirements context.

## Screenshots

| Light Mode | Dark Mode |
| --- | --- |
| <img src="assets/light.png" alt="Yomichi light mode screenshot" width="260" /> | <img src="assets/dark.png" alt="Yomichi dark mode screenshot" width="260" /> |

## Current Status

The app is an offline-first React Native port with a local SQLite cache, incremental WaniKani sync, pending-write queues, and working dashboard, lesson starter, and review flows.

Implemented highlights:

- API token login with secure token storage and `/user` validation.
- Incremental sync for users, subjects, assignments, study materials, level progressions, voice actors, and review statistics.
- Pending sync for review progress, lesson starts, and study material writes.
- Dashboard counts for lessons, reviews, SRS buckets, sync status, and cache stats.
- Review session state machine with active/review queues, batching, ordering options, wrong-answer delay, grouped meaning/reading mode, minimized review penalty, wrap-up mode, completion summary, and practice-session support.
- Answer checker behavior ported from Tsurukame, including kana input conversion, fuzzy matching, blacklists, other-reading detection, invalid character detection, and okurigana checks.
- Shared study UI for reviews, lessons, and diagnostics.
- Image-only radical support using WaniKani SVG assets, CSS-aware `react-native-svg` rendering, CSS variable fallback handling, and a Settings diagnostics preview screen.

Known major gaps:

- Lesson flow is still a starter/introduction flow; full lesson quiz parity is not implemented.
- Dashboard charts, subject browsing/search/details, audio playback, notifications, and most settings UI remain future milestones.
- In-session cheats, quick settings, and full lesson quiz parity are not yet implemented.

## Getting Started

```sh
pnpm install
pnpm start
pnpm android
```

## Commands

```sh
pnpm typecheck             # tsc --noEmit
pnpm test                  # jest --runInBand
pnpm start                 # expo start
pnpm android               # expo start --android
pnpm ios                   # expo start --ios
pnpm exec expo install --check
```

Use `pnpm` for dependency changes. Keep `pnpm-lock.yaml` current.
