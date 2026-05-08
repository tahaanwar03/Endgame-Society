import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  fetchGamePgn,
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

  if (result === "1-0" || result === "0-1" || result === "1/2-1/2") {
    return result;
  }

  return "1/2-1/2";
}

async function readSyncRegistry() {
  const db = getAdminDb();
  const snapshot = await db.doc("sync_config/lichess").get();

  const envTournamentIds = parseEnvList(process.env.LICHESS_TOURNAMENT_IDS);
  const envCreatorUsernames = parseEnvList(process.env.LICHESS_TOURNAMENT_CREATORS);

  if (!snapshot.exists) {
    return {
      tournamentIds: envTournamentIds,
      creatorUsernames: envCreatorUsernames
    } satisfies SyncRegistry;
  }

  const data = snapshot.data() ?? {};
  const tournamentIds = Array.isArray(data.tournamentIds) ? data.tournamentIds.filter((item): item is string => typeof item === "string") : [];
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

  if (registry.creatorUsernames.length > 0) {
    for (const username of registry.creatorUsernames) {
      try {
        const created = await fetchUserCreatedTournaments(username);
        for (const tournament of created) {
          tournamentIds.add(tournament.lichessId);
        }
      } catch (err) {
        console.error(`Failed to resolve tournaments for ${username}:`, err);
      }
    }
  }

  // Also include any tournaments already in our DB that aren't finished
  const existing = await db.collection("tournaments").where("source", "==", "lichess").get();

  for (const document of existing.docs) {
    const lichessId = document.get("lichessId");
    const status = document.get("status");

    if (typeof lichessId === "string" && (status === "created" || status === "ongoing")) {
      tournamentIds.add(lichessId);
    }
  }

  return Array.from(tournamentIds);
}

function normalizeStandings(entries: TournamentStandingSnapshot[]) {
  return entries.map((entry) => ({
    userId: entry.userId,
    username: entry.username,
    score: entry.score,
    rank: entry.rank
  }));
}

async function upsertTournament(tournamentId: string) {
  const db = getAdminDb();
  const tournament = await fetchTournamentData(tournamentId);

  if (!tournament) {
    // If it's in our DB but gone from Lichess, archive it
    const existing = await db.collection("tournaments").where("lichessId", "==", tournamentId).limit(1).get();

    if (!existing.empty) {
      await existing.docs[0].ref.set(
        {
          status: "archived",
          lastSyncedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
    return { deterministicId: tournamentId, gamesProcessed: 0 };
  }

  const standings = await fetchTournamentResults(tournamentId);
  const deterministicId = slugifyTournamentId(tournament.name, tournament.lichessId);
  const tournamentRef = db.collection("tournaments").doc(deterministicId);
  const existingSnapshot = await tournamentRef.get();
  const existingStatus = existingSnapshot.get("status");
  
  // If both Lichess and our DB say it's finished, we only sync standings once more then freeze metadata
  const isFrozen = existingStatus === "finished" && tournament.status === "finished";

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

  // Sync games — we limit to 100 per sync to avoid timeouts
  const games = await fetchTournamentGames(tournamentId);
  let gamesProcessed = 0;
  const maxGamesPerTournament = 100;

  for (const game of games) {
    if (gamesProcessed >= maxGamesPerTournament) break;

    const gameRef = db.collection("games").doc(game.gameId);
    const gameSnapshot = await gameRef.get();

    // Skip if we already have the PGN
    if (gameSnapshot.exists && gameSnapshot.get("movesPgn")) {
      continue;
    }

    try {
      const pgn = await fetchGamePgn(game.gameId);

      await gameRef.set(
        {
          id: game.gameId,
          tournamentId: deterministicId,
          lichessGameId: game.gameId,
          white: game.white,
          black: game.black,
          result: pgn ? pgnResultToScore(pgn) : "1/2-1/2",
          movesPgn: pgn || "",
          status: "finished",
          createdAt: game.createdAt ? Timestamp.fromDate(game.createdAt) : null,
          lastSyncedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      gamesProcessed += 1;
    } catch (e) {
      console.error(`Failed to sync game ${game.gameId}:`, e);
    }
  }

  return { deterministicId, gamesProcessed };
}

export async function runLichessSync(): Promise<SyncRunResult> {
  const db = getAdminDb();
  let tournamentIds: string[] = [];
  try {
    tournamentIds = await resolveTournamentIds();
  } catch (e) {
    console.error("Critical: Could not resolve tournament IDs:", e);
    return { runId: "failed", tournamentsProcessed: 0, gamesProcessed: 0, errors: ["Registry load failed"], tournamentIds: [] };
  }

  const runRef = db.collection("sync_logs").doc();
  const errors: string[] = [];
  let tournamentsProcessed = 0;
  let gamesProcessed = 0;

  await runRef.set({
    startedAt: FieldValue.serverTimestamp(),
    finishedAt: null,
    tournamentsProcessed: 0,
    gamesProcessed: 0,
    errors: [],
    tournamentIds
  });

  // Limit sync to 15 tournaments at a time to stay under timeouts
  const batch = tournamentIds.slice(0, 15);

  for (const tournamentId of batch) {
    try {
      const result = await upsertTournament(tournamentId);
      tournamentsProcessed += 1;
      gamesProcessed += result.gamesProcessed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Unknown sync error for ${tournamentId}.`;
      console.error(msg);
      errors.push(msg);
    }
  }

  await runRef.set(
    {
      finishedAt: FieldValue.serverTimestamp(),
      tournamentsProcessed,
      gamesProcessed,
      errors
    },
    { merge: true }
  );

  return {
    runId: runRef.id,
    tournamentsProcessed,
    gamesProcessed,
    errors,
    tournamentIds
  };
}
