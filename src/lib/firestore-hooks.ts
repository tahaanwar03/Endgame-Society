"use client";

import { useEffect, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase";
import { createDefaultStages, normalizeStages } from "@/lib/standings";
import type { Match, MatchResult, Player, Tournament, TournamentStage, TournamentStatus } from "@/lib/types";

type CollectionState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

type DocumentState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
  );
}

function asResult(value: unknown): MatchResult {
  return value === "1-0" || value === "0-1" || value === "1/2-1/2" ? value : null;
}

function asStatus(value: unknown): TournamentStatus {
  return value === "ongoing" || value === "completed" ? value : "upcoming";
}

function inferStageId(round: number, stages: TournamentStage[]) {
  const exact = stages.find((stage) => stage.round === round);
  return exact?.id ?? stages[0]?.id ?? "group-stage";
}

function normalizeTournament(id: string, data: DocumentData): Tournament {
  const rounds = asNumber(data.rounds, 1);
  return {
    id,
    name: asString(data.name),
    date: asString(data.date),
    rounds,
    status: asStatus(data.status),
    player_ids: asStringArray(data.player_ids),
    stages: normalizeStages(rounds, data.stages),
    group_assignments: asStringRecord(data.group_assignments)
  };
}

function normalizePlayer(id: string, data: DocumentData): Player {
  return {
    id,
    name: asString(data.name),
    elo: asNullableNumber(data.elo)
  };
}

function normalizeMatch(id: string, data: DocumentData, tournaments: Tournament[]): Match {
  const tournament = tournaments.find((item) => item.id === asString(data.tournament_id));
  const fallbackStages = tournament?.stages ?? createDefaultStages(asNumber(data.round, 1));
  const round = asNumber(data.round, 1);

  return {
    id,
    tournament_id: asString(data.tournament_id),
    round,
    player1_id: asString(data.player1_id),
    player2_id: asString(data.player2_id),
    result: asResult(data.result),
    stage_id: asString(data.stage_id) || inferStageId(round, fallbackStages),
    group_id: asString(data.group_id) || null,
    pgn: asString(data.pgn),
    created_at: data.created_at
  };
}

function useCollectionData<T extends { id: string }>(collectionName: string) {
  const [state, setState] = useState<CollectionState<T>>({
    data: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    const services = getFirebaseServices();

    if (!services) {
      setState({ data: [], loading: false, error: "Firebase environment variables are not configured." });
      return undefined;
    }

    return onSnapshot(
      collection(services.db, collectionName),
      (snapshot) => {
        setState({
          data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T),
          loading: false,
          error: null
        });
      },
      (error) => {
        setState({ data: [], loading: false, error: error.message });
      }
    );
  }, [collectionName]);

  return state;
}

export function useTournaments() {
  const state = useCollectionData<DocumentData & { id: string }>("tournaments");

  return {
    ...state,
    data: state.data
      .map((tournament) => normalizeTournament(tournament.id, tournament))
      .filter((tournament) => tournament.name)
      .sort((a, b) => b.date.localeCompare(a.date))
  };
}

export function usePlayers() {
  const state = useCollectionData<DocumentData & { id: string }>("players");

  return {
    ...state,
    data: state.data
      .map((player) => normalizePlayer(player.id, player))
      .filter((player) => player.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function useMatches(tournamentId?: string) {
  const tournaments = useTournaments();
  const state = useCollectionData<DocumentData & { id: string }>("matches");

  return {
    ...state,
    loading: tournaments.loading || state.loading,
    error: tournaments.error || state.error,
    data: state.data
      .map((match) => normalizeMatch(match.id, match, tournaments.data))
      .filter((match) => !tournamentId || match.tournament_id === tournamentId)
      .sort((a, b) => {
        if (a.round !== b.round) {
          return a.round - b.round;
        }

        return a.created_at && b.created_at ? 0 : 0;
      })
  };
}

export function useMatch(matchId: string) {
  const tournaments = useTournaments();
  const [state, setState] = useState<DocumentState<Match>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const services = getFirebaseServices();

    if (!services) {
      setState({ data: null, loading: false, error: "Firebase environment variables are not configured." });
      return undefined;
    }

    return onSnapshot(
      doc(services.db, "matches", matchId),
      (snapshot) => {
        setState({
          data: snapshot.exists() ? normalizeMatch(snapshot.id, snapshot.data(), tournaments.data) : null,
          loading: false,
          error: null
        });
      },
      (error) => {
        setState({ data: null, loading: false, error: error.message });
      }
    );
  }, [matchId, tournaments.data]);

  return {
    ...state,
    loading: tournaments.loading || state.loading,
    error: tournaments.error || state.error
  };
}

function servicesOrThrow() {
  const services = getFirebaseServices();

  if (!services) {
    throw new Error("Firebase environment variables are not configured.");
  }

  return services;
}

export async function createTournament(input: {
  name: string;
  date: string;
  rounds: number;
  status: TournamentStatus;
}) {
  const { db } = servicesOrThrow();
  await addDoc(collection(db, "tournaments"), {
    ...input,
    player_ids: [],
    stages: createDefaultStages(input.rounds),
    group_assignments: {}
  });
}

export async function updateTournament(id: string, input: Partial<Omit<Tournament, "id">>) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "tournaments", id), input as DocumentData);
}

export async function createPlayer(input: { name: string; elo: number | null }) {
  const { db } = servicesOrThrow();
  await addDoc(collection(db, "players"), input);
}

export async function createPlayersBulk(inputs: Array<{ name: string; elo: number | null }>) {
  const { db } = servicesOrThrow();
  const batch = writeBatch(db);

  for (const input of inputs) {
    const playerRef = doc(collection(db, "players"));
    batch.set(playerRef, input);
  }

  await batch.commit();
}

export async function updatePlayer(id: string, input: { name: string; elo: number | null }) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "players", id), input);
}

export async function addPlayerToTournament(tournamentId: string, playerId: string) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "tournaments", tournamentId), { player_ids: arrayUnion(playerId) });
}

export async function removePlayerFromTournament(tournamentId: string, playerId: string) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "tournaments", tournamentId), {
    player_ids: arrayRemove(playerId),
    [`group_assignments.${playerId}`]: null
  });
}

export async function setTournamentPlayerGroup(tournamentId: string, playerId: string, groupCode: string | null) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "tournaments", tournamentId), {
    [`group_assignments.${playerId}`]: groupCode
  });
}

export async function deleteTournamentWithMatches(tournamentId: string, matchIds: string[]) {
  const { db } = servicesOrThrow();
  const batch = writeBatch(db);

  for (const matchId of matchIds) {
    batch.delete(doc(db, "matches", matchId));
  }

  batch.delete(doc(db, "tournaments", tournamentId));
  await batch.commit();
}

export async function deletePlayerAndCleanup(playerId: string, tournamentIds: string[]) {
  const { db } = servicesOrThrow();
  const batch = writeBatch(db);

  for (const tournamentId of tournamentIds) {
    batch.update(doc(db, "tournaments", tournamentId), {
      player_ids: arrayRemove(playerId),
      [`group_assignments.${playerId}`]: null
    });
  }

  batch.delete(doc(db, "players", playerId));
  await batch.commit();
}

export async function createMatch(input: {
  tournament_id: string;
  round: number;
  stage_id: string;
  group_id: string | null;
  player1_id: string;
  player2_id: string;
}) {
  const { db } = servicesOrThrow();
  await addDoc(collection(db, "matches"), {
    ...input,
    result: null,
    pgn: "",
    created_at: serverTimestamp()
  });
}

export async function updateMatch(
  id: string,
  input: Partial<{
    tournament_id: string;
    round: number;
    stage_id: string;
    group_id: string | null;
    player1_id: string;
    player2_id: string;
    result: MatchResult;
    pgn: string;
  }>
) {
  const { db } = servicesOrThrow();
  await updateDoc(doc(db, "matches", id), input as DocumentData);
}

export async function deleteMatch(id: string) {
  const { db } = servicesOrThrow();
  await deleteDoc(doc(db, "matches", id));
}
