import type { Match, Player, Standing } from "@/lib/types";

export function getPlayerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.name ?? "Unknown player";
}

export function computeStandings(players: Player[], matches: Match[]): Standing[] {
  const table = new Map<string, Standing>();

  for (const player of players) {
    table.set(player.id, {
      player,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      played: 0
    });
  }

  for (const match of matches) {
    if (!match.result) {
      continue;
    }

    const white = table.get(match.player1_id);
    const black = table.get(match.player2_id);

    if (!white || !black) {
      continue;
    }

    white.played += 1;
    black.played += 1;

    if (match.result === "1-0") {
      white.points += 1;
      white.wins += 1;
      black.losses += 1;
    }

    if (match.result === "0-1") {
      black.points += 1;
      black.wins += 1;
      white.losses += 1;
    }

    if (match.result === "1/2-1/2") {
      white.points += 0.5;
      black.points += 0.5;
      white.draws += 1;
      black.draws += 1;
    }
  }

  return Array.from(table.values()).sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    return a.player.name.localeCompare(b.player.name);
  });
}

export function groupMatchesByRound(matches: Match[]) {
  return matches
    .slice()
    .sort((a, b) => a.round - b.round)
    .reduce<Map<number, Match[]>>((rounds, match) => {
      const round = rounds.get(match.round) ?? [];
      round.push(match);
      rounds.set(match.round, round);
      return rounds;
    }, new Map());
}
