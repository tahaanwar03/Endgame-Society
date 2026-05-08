import "server-only";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type LichessTournamentApiResponse = {
  id?: string;
  fullName?: string;
  createdBy?: string;
  minutes?: number;
  clock?: { limit?: number; increment?: number };
  startsAt?: number;
  finishesAt?: number;
  createdAt?: number;
  isFinished?: boolean;
  isStarted?: boolean;
  nbPlayers?: number;
  status?: string;
};

type LichessResultApiResponse = {
  rank?: number;
  score?: number;
  username?: string;
};

type LichessGameApiResponse = {
  id?: string;
  createdAt?: number;
  players?: {
    white?: { user?: { name?: string } };
    black?: { user?: { name?: string } };
  };
};

type LichessCreatedTournamentApiResponse = {
  id?: string;
  fullName?: string;
  startsAt?: number;
  finishesAt?: number;
  isFinished?: boolean;
  isStarted?: boolean;
};

export type LichessTournamentSummary = {
  lichessId: string;
  name: string;
  status: "created" | "ongoing" | "finished";
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  clock: {
    limit: number;
    increment: number;
  };
};

export type LichessStandingEntry = {
  userId: string;
  username: string;
  score: number;
  rank: number;
};

export type LichessTournamentGame = {
  gameId: string;
  white: string;
  black: string;
  createdAt?: Date;
};

const API_BASE = "https://lichess.org";
const MAX_ATTEMPTS = 2;
// Per-request timeout — prevents any single Lichess call from hanging forever
const REQUEST_TIMEOUT_MS = 12_000;

function getToken() {
  const token = process.env.LICHESS_API_TOKEN;
  if (!token) throw new Error("LICHESS_API_TOKEN is not configured.");
  return token;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(path: string, init?: RequestInit) {
  const token = getToken();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {})
        },
        cache: "no-store"
      });
      clearTimeout(timer);

      if (response.status === 404) return response;
      if (response.ok) return response;

      // Rate limited — wait briefly then retry (never 60s, max 5s)
      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        await delay(5_000);
        continue;
      }

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await delay(1_000);
        continue;
      }

      throw new Error(`Lichess API error: ${response.status} (${path})`);
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error : new Error("Unknown Lichess request failure.");
      if ((error as Error)?.name === "AbortError") {
        throw new Error(`Lichess request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${path}`);
      }
      if (attempt < MAX_ATTEMPTS) {
        await delay(1_000);
        continue;
      }
    }
  }

  throw lastError ?? new Error(`Lichess request failed: ${path}`);
}

async function fetchJson<T extends JsonValue>(path: string) {
  const response = await fetchWithRetry(path);

  if (response.status === 404) {
    return null;
  }

  return (await response.json()) as T;
}

async function fetchText(path: string, accept = "text/plain") {
  const response = await fetchWithRetry(path, {
    headers: {
      Accept: accept
    }
  });

  if (response.status === 404) {
    return null;
  }

  return response.text();
}

function parseNdjson<T>(input: string | null) {
  if (!input) {
    return [] as T[];
  }

  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function normalizeTournamentStatus(data: LichessTournamentApiResponse): LichessTournamentSummary["status"] {
  if (data.isFinished || data.status === "finished") return "finished";
  if (data.isStarted || data.status === "started") return "ongoing";
  return "created";
}

function asDate(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === "") return undefined;
  
  // Try treating as a timestamp (number or numeric string)
  const num = Number(value);
  if (!isNaN(num) && num > 0) {
    // If num is small (e.g. < 10^11), it's likely seconds since epoch.
    // Lichess ms timestamps for the 2020s are around 1.6e12.
    const isSeconds = num < 10000000000;
    return new Date(isSeconds ? num * 1000 : num);
  }
  
  // Try treating as an ISO string
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function fetchTournamentData(tournamentId: string) {
  // Try Arena API first
  let data = await fetchJson<LichessTournamentApiResponse>(`/api/tournament/${tournamentId}`);

  // If not found or looks like Swiss (missing Arena-only fields), try Swiss API
  if (!data?.id || !data.fullName) {
    data = await fetchJson<LichessTournamentApiResponse>(`/api/swiss/${tournamentId}`);
  }

  if (!data?.id || !data.fullName) {
    return null;
  }

  const startedAt = asDate(data.startsAt);
  const endedAt = asDate(data.finishesAt);
  const createdAt = asDate(data.createdAt) || startedAt || endedAt || new Date();

  return {
    lichessId: data.id,
    name: data.fullName,
    status: normalizeTournamentStatus(data),
    createdAt,
    startedAt,
    endedAt,
    clock: {
      limit: typeof data.clock?.limit === "number" ? data.clock.limit : 0,
      increment: typeof data.clock?.increment === "number" ? data.clock.increment : 0
    }
  } satisfies LichessTournamentSummary;
}

export async function fetchTournamentResults(tournamentId: string) {
  const text = await fetchText(`/api/tournament/${tournamentId}/results`, "application/x-ndjson");
  const parsed = parseNdjson<LichessResultApiResponse>(text);

  return parsed
    .filter((entry) => entry.username)
    .map((entry) => ({
      userId: entry.username!.toLowerCase(),
      username: entry.username!,
      score: typeof entry.score === "number" ? entry.score : 0,
      rank: typeof entry.rank === "number" ? entry.rank : 0
    }))
    .sort((a, b) => a.rank - b.rank) satisfies LichessStandingEntry[];
}

export async function fetchTournamentGames(tournamentId: string) {
  const text = await fetchText(
    `/api/tournament/${tournamentId}/games?moves=false&clocks=false&evals=false&opening=false&pgnInJson=false`,
    "application/x-ndjson"
  );
  const parsed = parseNdjson<LichessGameApiResponse>(text);

  return parsed
    .filter((entry) => entry.id)
    .map((entry) => ({
      gameId: entry.id!,
      white: entry.players?.white?.user?.name ?? "White",
      black: entry.players?.black?.user?.name ?? "Black",
      createdAt: asDate(entry.createdAt)
    }))
    .filter((entry) => entry.white && entry.black) satisfies LichessTournamentGame[];
}

export async function fetchGamePgn(gameId: string) {
  return fetchText(`/game/export/${gameId}`, "application/x-chess-pgn");
}

/**
 * Bulk-fetch PGNs for multiple games in a single API call.
 * Returns a map of gameId -> pgn string.
 */
export async function fetchGamesPgnBulk(gameIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (gameIds.length === 0) return result;

  const token = getToken();
  const response = await fetch(`${API_BASE}/api/games/export/_ids`, {
    method: "POST",
    headers: {
      Accept: "application/x-chess-pgn",
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain"
    },
    body: gameIds.join(","),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Bulk PGN fetch failed: ${response.status}`);
  }

  const text = await response.text();
  // Split on double-newline between PGN games
  const games = text.split(/\n\n\[/).map((g, i) => (i === 0 ? g : "[" + g));

  for (const pgn of games) {
    const idMatch = pgn.match(/\[Site "https:\/\/lichess\.org\/([^"]+)"\]/);
    if (idMatch?.[1]) {
      result.set(idMatch[1], pgn);
    }
  }

  return result;
}

export async function fetchUserGames(username: string) {
  return fetchText(`/api/games/user/${encodeURIComponent(username)}`, "application/x-ndjson");
}

export async function fetchUserCreatedTournaments(username: string) {
  // Limit to 30 most recent to avoid huge NDJSON payloads
  const text = await fetchText(`/api/user/${encodeURIComponent(username)}/tournament/created?max=30`, "application/x-ndjson");
  const parsed = parseNdjson<LichessCreatedTournamentApiResponse>(text);

  return parsed
    .filter((entry) => entry.id && entry.fullName)
    .map((entry) => ({
      lichessId: entry.id!,
      name: entry.fullName!,
      status: entry.isFinished ? "finished" : entry.isStarted ? "ongoing" : "created",
      startedAt: asDate(entry.startsAt),
      endedAt: asDate(entry.finishesAt)
    }));
}
