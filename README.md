# The Endgame Society Portal

Mobile-first tournament viewer and remote admin panel for a university chess society.

The app supports two tournament sources:

- `manual`: admin-managed over-the-board society events
- `lichess`: mirrored online tournaments synced into Firestore on a schedule

## Stack

- Next.js App Router
- Tailwind CSS
- Firebase Auth and Firestore
- Firebase Admin for server-side sync writes
- GSAP for the landing hero only
- chess.js for PGN parsing
- react-chessboard for match replay

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill Firebase/Vercel values:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.edu
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
LICHESS_API_TOKEN=
LICHESS_TOURNAMENT_IDS=
LICHESS_TOURNAMENT_CREATORS=
CRON_SECRET=
```

3. Run locally:

```bash
npm run dev
```

## Firebase

Collections:

- `tournaments`: manual tournaments plus mirrored Lichess snapshots
- `players`: `name`, `elo`
- `matches`: manual over-the-board fixtures
- `games`: mirrored Lichess games with PGN
- `sync_logs`: sync run diagnostics
- `sync_config/lichess`: optional Firestore registry document with `tournamentIds` and `creatorUsernames`

Manual tournament standings are computed from match results in the browser.
Lichess tournament standings are stored as Firestore snapshots and rendered directly from Firestore.

## Lichess Sync

Server-only sync entrypoint:

- `GET/POST /api/cron/lichess-sync`

Vercel cron schedule:

- every 10 minutes via [vercel.json](H:/Endgame/vercel.json)

Registry sources for tournaments to sync:

- `LICHESS_TOURNAMENT_IDS`
- `LICHESS_TOURNAMENT_CREATORS`
- `sync_config/lichess` Firestore document

For production, update `firestore.rules` with the real admin email list before deploying rules.

## Vercel

Set the same Firebase variables in the Vercel project environment. Admin edits happen through Firebase from `/admin`, so tournament updates do not require redeploys.

## Git Hygiene

Do not commit local runtime artifacts. This repo ignores:

- `node_modules`
- `.next`
- `.env.local`
- local npm cache folders
- `*.log`
- `*.tsbuildinfo`
