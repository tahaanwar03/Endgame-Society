import "server-only";

import { FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  fetchGamesPgnBulk,
  fetchTournamentData,
  fetchTournamentGames,
  fetchTournamentResults,
  fetchUserCreatedTournaments
} from "@/lib/lichessClient";
import type { Game, TournamentStandingSnapshot } from "@/lib/types";

type SyncRunResult = {
  runId: string;
  tournamentsProcessed: number;
  gamesProcessed: number;
  errors: string[];
  tournamentIds: string[];
};

type SyncRegistry = {
  tournamentIds: string[];
  creatorUsernames: string[];
};

// Hard wall-clock budget: stop processing new tournaments after this many ms
const SYNC_TIME_BUDGET_MS = 50_000;

function slugifyTournamentId(name: string, lichessId: string) {
  return `${name}-${lichessId}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseEnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pgnResultToScore(pgn: string): Game["result"] {
  const match = pgn.match(/\[Result "([^"]+)"\]/);
  const result = match?.[1];
  if (result === "1-0" || result === "0-1" || result === "1/2-1/2") return result;
  return "1/2-1/2";
}

async function readSyncRegistry() {
  const db = getAdminDb();
  const snapshot = await db.doc("sync_config/lichess").get();
  const envTournamentIds = parseEnvList(process.env.LICHESS_TOURNAMENT_IDS);
  const envCreatorUsernames = parseEnvList(process.env.LICHESS_TOURNAMENT_CREATORS);

  if (!snapshot.exists) {
    return { tournamentIds: envTournamentIds, creatorUsernames: envCreatorUsernames } satisfies SyncRegistry;
  }

  const data = snapshot.data() ?? {};
  const tournamentIds = Array.isArray(data.tournamentIds)
    ? data.tournamentIds.filter((item): item is string => typeof item === "string")
    : [];
  const creatorUsernames = Array.isArray(data.creatorUsernames)
    ? data.creatorUsernames.filter((item): item is string => typeof item === "string")
    : [];

  return {
    tournamentIds: Array.from(new Set([...envTournamentIds, ...tournamentIds])),
    creatorUsernames: Array.from(new Set([...envCreatorUsernames, ...creatorUsernames]))
  } satisfies SyncRegistry;
}

async function resolveTournamentIds() {
  const db = getAdminDb();
  const registry = await readSyncRegistry();
  const tournamentIds = new Set(registry.tournamentIds);

  for (const username of registry.creatorUsernames) {
    try {
      const created = await fetchUserCreatedTournaments(username);
      for (const t of created) tournamentIds.add(t.lichessId);
    } catch (err) {
      console.error(`Failed to resolve tournaments for ${username}:`, err);
    }
  }

  // Re-queue active tournaments already in Firestore
  const existing = await db.collection("tournaments").where("source", "==", "lichess").get();
  for (const doc of existing.docs) {
    const lichessId = doc.get("lichessId");
    const status = doc.get("status");
    if (typeof lichessId === "string" && (status === "created" || status === "ongoing")) {
      tournamentIds.add(lichessId);
    }
  }

  return Array.from(tournamentIds);
}

function normalizeStandings(entries: TournamentStandingSnapshot[]) {
  return entries.map((e) => ({ userId: e.userId, username: e.username, score: e.score, rank: e.rank }));
}

/** Commits a Firestore WriteBatch in chunks of max 400 to stay under the 500-write limit */
async function commitInChunks(db: ReturnType<typeof getAdminDb>, writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: object }>) {
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch: WriteBatch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) {
      batch.set(w.ref as FirebaseFirestore.DocumentReference, w.data, { merge: true });
    }
    await batch.commit();
  }
}

async function upsertTournament(tournamentId: string) {
  const db = getAdminDb();
  const tournament = await fetchTournamentData(tournamentId);

  if (!tournament) {
    const existing = await db.collection("tournaments").where("lichessId", "==", tournamentId).limit(1).get();
    if (!existing.empty) {
      await existing.docs[0].ref.set({ status: "archived", lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { deterministicId: tournamentId, gamesProcessed: 0 };
  }

  const standings = await fetchTournamentResults(tournamentId);
  const deterministicId = slugifyTournamentId(tournament.name, tournament.lichessId);
  const tournamentRef = db.collection("tournaments").doc(deterministicId);
  const existingSnap = await tournamentRef.get();
  const isFrozen = existingSnap.get("status") === "finished" && tournament.status === "finished";

  if (!isFrozen) {
    await tournamentRef.set(
      {
        id: deterministicId,
        lichessId: tournament.lichessId,
        name: tournament.name,
        status: tournament.status,
        source: "lichess",
        createdAt: Timestamp.fromDate(tournament.createdAt),
        startedAt: tournament.startedAt ? Timestamp.fromDate(tournament.startedAt) : null,
        endedAt: tournament.endedAt ? Timestamp.fromDate(tournament.endedAt) : null,
        lastSyncedAt: FieldValue.serverTimestamp(),
        clock: tournament.clock,
        standings: normalizeStandings(standings),
        date: tournament.startedAt ? tournament.startedAt.toISOString().slice(0, 10) : "",
        rounds: 0,
        player_ids: [],
        stages: [],
        group_assignments: {}
      },
      { merge: true }
    );
  }

  // If tournament is frozen (finished + already synced), skip games
  if (isFrozen) {
    return { deterministicId, gamesProcessed: 0 };
  }

  const games = await fetchTournamentGames(tournamentId);
  if (games.length === 0) return { deterministicId, gamesProcessed: 0 };

  // ONE bulk request for all PGNs — no per-game HTTP calls
  const allGameIds = games.map((g) => g.gameId);
  const pgnMap = await fetchGamesPgnBulk(allGameIds);

  const writes = games.map((game) => {
    const pgn = pgnMap.get(game.gameId) ?? "";
    return {
      ref: db.collection("games").doc(game.gameId),
      data: {
        id: game.gameId,
        tournamentId: deterministicId,
        lichessGameId: game.gameId,
        white: game.white,
        black: game.black,
        result: pgn ? pgnResultToScore(pgn) : "1/2-1/2",
        movesPgn: pgn,
        status: "finished",
        createdAt: game.createdAt ? Timestamp.fromDate(game.createdAt) : null,
        lastSyncedAt: FieldValue.serverTimestamp()
      }
    };
  });

  await commitInChunks(db, writes);

  return { deterministicId, gamesProcessed: writes.length };
}

export async function runLichessSync(): Promise<SyncRunResult> {
  const db = getAdminDb();
  let tournamentIds: string[] = [];

  try {
    tournamentIds = await resolveTournamentIds();
  } catch (e) {
    console.error("Critical: Could not resolve tournament IDs:", e);
    return {
      runId: "failed",
      tournamentsProcessed: 0,
      gamesProcessed: 0,
      errors: ["Registry load failed: " + (e instanceof Error ? e.message : String(e))],
      tournamentIds: []
    };
  }

  const runRef = db.collection("sync_logs").doc();
  const errors: string[] = [];
  let tournamentsProcessed = 0;
  let gamesProcessed = 0;
  const deadline = Date.now() + SYNC_TIME_BUDGET_MS;

  await runRef.set({
    startedAt: FieldValue.serverTimestamp(),
    finishedAt: null,
    tournamentsProcessed: 0,
    gamesProcessed: 0,
    errors: [],
    tournamentIds
  });

  for (const tournamentId of tournamentIds) {
    // Stop before we hit the time limit so we can still write the log
    if (Date.now() > deadline) {
      errors.push(`Time budget reached. ${tournamentIds.length - tournamentsProcessed} tournaments deferred to next run.`);
      break;
    }

    try {
      const result = await upsertTournament(tournamentId);
      tournamentsProcessed++;
      gamesProcessed += result.gamesProcessed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Unknown error for ${tournamentId}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  await runRef.set(
    { finishedAt: FieldValue.serverTimestamp(), tournamentsProcessed, gamesProcessed, errors },
    { merge: true }
  );

  return { runId: runRef.id, tournamentsProcessed, gamesProcessed, errors, tournamentIds };
}
