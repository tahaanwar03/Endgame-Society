export type TournamentStatus = "upcoming" | "ongoing" | "completed" | "created" | "finished" | "archived";

export type TournamentSource = "manual" | "lichess";

export type MatchResult = "1-0" | "0-1" | "1/2-1/2" | null;

export type TournamentStageType = "group" | "knockout";

export type TournamentStage = {
  id: string;
  name: string;
  type: TournamentStageType;
  round: number;
  groups?: string[];
};

export type TournamentClock = {
  limit: number;
  increment: number;
};

export type TournamentStandingSnapshot = {
  userId: string;
  username: string;
  score: number;
  rank: number;
};

export type Tournament = {
  id: string;
  name: string;
  date: string;
  rounds: number;
  status: TournamentStatus;
  source: TournamentSource;
  lichessId?: string;
  createdAt?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  lastSyncedAt?: unknown;
  clock?: TournamentClock | null;
  standings: TournamentStandingSnapshot[];
  player_ids: string[];
  stages: TournamentStage[];
  group_assignments: Record<string, string>;
};

export type Player = {
  id: string;
  name: string;
  elo: number | null;
};

export type MatchGame = {
  id: string;
  white_id: string;
  black_id: string;
  result: MatchResult;
  pgn: string;
};

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  player1_id: string;
  player2_id: string;
  result: MatchResult;
  stage_id: string;
  group_id: string | null;
  pgn?: string;
  series?: MatchGame[];
  created_at?: unknown;
};

export type Game = {
  id: string;
  tournamentId: string;
  lichessGameId: string;
  white: string;
  black: string;
  result: Exclude<MatchResult, null>;
  movesPgn: string;
  status: "finished";
  createdAt?: unknown;
  lastSyncedAt?: unknown;
};

export type Standing = {
  player: Player;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
};
