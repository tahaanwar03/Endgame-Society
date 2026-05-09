import type { Match, Player, Standing, Tournament, TournamentStage } from "@/lib/types";

const DEFAULT_GROUP_CODES = ["A", "B", "C", "D"];

export type GroupStageMatchSection = {
  stage: TournamentStage & { type: "group" };
  groupSections: Array<{ groupCode: string; matches: Match[] }>;
};

export type KnockoutStageMatchSection = {
  stage: TournamentStage & { type: "knockout" };
  matches: Match[];
};

export type StageMatchSection = GroupStageMatchSection | KnockoutStageMatchSection;

export function slugifyStageName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createDefaultStages(rounds: number): TournamentStage[] {
  const totalRounds = Math.max(1, rounds);
  const stages: TournamentStage[] = [
    {
      id: "group-stage",
      name: "Group Stage",
      type: "group",
      round: 1,
      groups: DEFAULT_GROUP_CODES
    }
  ];

  for (let round = 2; round <= totalRounds; round += 1) {
    stages.push({
      id: `knockout-${round}`,
      name: getDefaultKnockoutName(totalRounds, round),
      type: "knockout",
      round
    });
  }

  return stages;
}

function getDefaultKnockoutName(totalRounds: number, round: number) {
  const roundsFromEnd = totalRounds - round;

  if (roundsFromEnd === 0) {
    return "Final";
  }

  if (roundsFromEnd === 1) {
    return "Semifinal";
  }

  if (roundsFromEnd === 2) {
    return "Quarterfinal";
  }

  return `Knockout Round ${round - 1}`;
}

export function normalizeStages(rounds: number, rawStages: unknown): TournamentStage[] {
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    return createDefaultStages(rounds);
  }

  const stages = rawStages.reduce<TournamentStage[]>((accumulator, item, index) => {
      if (!item || typeof item !== "object") {
        return accumulator;
      }

      const candidate = item as Partial<TournamentStage>;
      const type = candidate.type === "knockout" ? "knockout" : "group";
      const groups = Array.isArray(candidate.groups)
        ? candidate.groups.filter((group): group is string => typeof group === "string" && group.trim().length > 0)
        : undefined;

      accumulator.push({
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `stage-${index + 1}`,
        name: typeof candidate.name === "string" && candidate.name ? candidate.name : `Stage ${index + 1}`,
        type,
        round: typeof candidate.round === "number" && Number.isFinite(candidate.round) ? candidate.round : index + 1,
        groups: type === "group" ? (groups?.length ? groups : DEFAULT_GROUP_CODES) : undefined
      });
      return accumulator;
    }, [])
    .sort((a, b) => a.round - b.round);

  return stages.length > 0 ? stages : createDefaultStages(rounds);
}

export function getGroupStage(tournament: Tournament) {
  return tournament.stages.find((stage) => stage.type === "group") ?? tournament.stages[0] ?? null;
}

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

export function getTournamentPlayersByGroup(tournament: Tournament, players: Player[]) {
  const rosterSet = new Set(tournament.player_ids);
  const rosterPlayers = players.filter((player) => rosterSet.has(player.id));

  // Aggregate group codes from ALL group-type stages (not just the first one)
  const groupCodes = tournament.stages
    .filter((stage) => stage.type === "group")
    .flatMap((stage) => stage.groups ?? [])
    .filter((code, index, arr) => arr.indexOf(code) === index); // deduplicate

  const grouped = new Map<string, Player[]>();

  for (const groupCode of groupCodes) {
    grouped.set(groupCode, []);
  }

  const unassigned: Player[] = [];

  for (const player of rosterPlayers) {
    const groupCode = tournament.group_assignments[player.id];

    if (groupCode && grouped.has(groupCode)) {
      grouped.get(groupCode)?.push(player);
    } else {
      unassigned.push(player);
    }
  }

  for (const groupCode of groupCodes) {
    grouped.get(groupCode)?.sort((a, b) => a.name.localeCompare(b.name));
  }

  unassigned.sort((a, b) => a.name.localeCompare(b.name));

  return { grouped, unassigned };
}

export function buildStandingsByGroup(tournament: Tournament, players: Player[], matches: Match[]) {
  const { grouped } = getTournamentPlayersByGroup(tournament, players);
  const groupStage = getGroupStage(tournament);

  return Array.from(grouped.entries()).map(([groupCode, groupPlayers]) => {
    const groupMatches = matches.filter(
      (match) =>
        match.stage_id === groupStage?.id &&
        match.group_id === groupCode
    );

    return {
      groupCode,
      players: groupPlayers,
      matches: groupMatches,
      standings: computeStandings(groupPlayers, groupMatches)
    };
  });
}

export function groupMatchesByStage(tournament: Tournament, matches: Match[]): StageMatchSection[] {
  return tournament.stages.map((stage) => {
    const stageMatches = matches
      .filter((match) => match.stage_id === stage.id)
      .sort((a, b) => a.round - b.round);

    if (stage.type === "group") {
      const groups = stage.groups ?? [];
      return {
        stage: stage as TournamentStage & { type: "group" },
        groupSections: groups.map((groupCode) => ({
          groupCode,
          matches: stageMatches.filter((match) => match.group_id === groupCode)
        }))
      };
    }

    return { stage: stage as TournamentStage & { type: "knockout" }, matches: stageMatches };
  });
}
