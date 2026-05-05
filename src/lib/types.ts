export type TournamentStatus = "upcoming" | "ongoing" | "completed";

export type MatchResult = "1-0" | "0-1" | "1/2-1/2" | null;

export type Tournament = {
  id: string;
  name: string;
  date: string;
  rounds: number;
  status: TournamentStatus;
  player_ids: string[];
};

export type Player = {
  id: string;
  name: string;
  elo: number | null;
};

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  player1_id: string;
  player2_id: string;
  result: MatchResult;
  pgn?: string;
  created_at?: unknown;
};

export type Standing = {
  player: Player;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
};
