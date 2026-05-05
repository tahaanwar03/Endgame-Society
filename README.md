# The Endgame Society Portal

Mobile-first tournament viewer and remote admin panel for a university chess society.

## Stack

- Next.js App Router
- Tailwind CSS
- Firebase Auth and Firestore
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
```

3. Run locally:

```bash
npm run dev
```

## Firebase

Collections:

- `tournaments`: `name`, `date`, `rounds`, `status`, `player_ids`
- `players`: `name`, `elo`
- `matches`: `tournament_id`, `round`, `player1_id`, `player2_id`, `result`, `pgn`, `created_at`

Standings are not stored. They are computed from match results in the browser.

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
