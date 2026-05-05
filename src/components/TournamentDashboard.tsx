"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useMatches, usePlayers, useTournaments } from "@/lib/firestore-hooks";
import { computeStandings, getPlayerName, groupMatchesByRound } from "@/lib/standings";

type Tab = "standings" | "fixtures" | "players";

const tabs: { id: Tab; label: string }[] = [
  { id: "standings", label: "Standings" },
  { id: "fixtures", label: "Fixtures" },
  { id: "players", label: "Players" }
];

export function TournamentDashboard({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<Tab>("standings");
  const tournaments = useTournaments();
  const players = usePlayers();
  const matches = useMatches(tournamentId);

  if (tournaments.loading || players.loading || matches.loading) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <LoadingState label="Loading tournament" />
      </main>
    );
  }

  const error = tournaments.error || players.error || matches.error;

  if (error) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Tournament data unavailable" detail={error} />
      </main>
    );
  }

  const tournament = tournaments.data.find((item) => item.id === tournamentId);

  if (!tournament) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Tournament not found" detail="This tournament may have been removed or not published yet." />
      </main>
    );
  }

  const matchedPlayerIds = new Set(matches.data.flatMap((match) => [match.player1_id, match.player2_id]));
  const rosterPlayerIds = tournament.player_ids.length > 0 ? new Set(tournament.player_ids) : matchedPlayerIds;
  const tournamentPlayers = players.data.filter((player) => rosterPlayerIds.has(player.id));
  const standingsPlayers = players.data.filter((player) => matchedPlayerIds.has(player.id));
  const standings = computeStandings(standingsPlayers, matches.data);
  const rounds = groupMatchesByRound(matches.data);

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-12">
      <section className="mb-8 border-l-2 border-primary pl-4">
        <div className="mb-3 flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Tournament Dashboard</p>
          <StatusBadge status={tournament.status} />
        </div>
        <h1 className="font-serif text-4xl text-on-surface">{tournament.name}</h1>
        <p className="mt-2 text-sm text-neutral-500">{`${tournament.date || "Unscheduled"} - ${tournament.rounds} rounds`}</p>
      </section>

      <div className="mb-6 flex border-b border-neutral-800">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-12 flex-1 text-center text-xs font-bold uppercase tracking-[0.18em] ${
              tab === item.id ? "border-b-2 border-primary text-primary" : "text-neutral-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "standings" ? (
        <section className="overflow-hidden border border-neutral-800 bg-surface-container-low">
          {standings.length === 0 ? (
            <div className="p-6 text-sm text-on-surface-variant">No standings yet. Add fixtures or results in admin.</div>
          ) : (
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-neutral-900 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-4 text-center">Rank</th>
                    <th className="px-4 py-4">Player</th>
                    <th className="px-4 py-4 text-right">Pts</th>
                    <th className="px-3 py-4 text-center">P</th>
                    <th className="px-3 py-4 text-center">W</th>
                    <th className="px-3 py-4 text-center">D</th>
                    <th className="px-3 py-4 text-center">L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {standings.map((standing, index) => (
                    <tr key={standing.player.id} className="zebra-row">
                      <td className="px-4 py-4 text-center font-bold text-primary">{index + 1}</td>
                      <td className="px-4 py-4 font-semibold">{standing.player.name}</td>
                      <td className="px-4 py-4 text-right font-bold text-primary">{standing.points}</td>
                      <td className="px-3 py-4 text-center text-neutral-400">{standing.played}</td>
                      <td className="px-3 py-4 text-center text-neutral-400">{standing.wins}</td>
                      <td className="px-3 py-4 text-center text-neutral-400">{standing.draws}</td>
                      <td className="px-3 py-4 text-center text-neutral-400">{standing.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "fixtures" ? (
        <section className="space-y-5">
          {rounds.size === 0 ? (
            <EmptyState title="No fixtures created" detail="Admin-created matches will appear here grouped by round." />
          ) : (
            Array.from(rounds.entries()).map(([round, roundMatches]) => (
              <div key={round} className="border border-neutral-800 bg-surface-container-low">
                <h2 className="border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Round {round}
                </h2>
                <div className="divide-y divide-neutral-900">
                  {roundMatches.map((match) => (
                    <Link
                      key={match.id}
                      href={`/match/${match.id}`}
                      className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4 text-sm hover:bg-neutral-900/60"
                    >
                      <span>
                        {getPlayerName(players.data, match.player1_id)} vs {getPlayerName(players.data, match.player2_id)}
                      </span>
                      <span className="font-bold text-primary">{match.result ?? "Pending"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {tab === "players" ? (
        <section className="grid gap-3 md:grid-cols-2">
          {tournamentPlayers.length === 0 ? (
            <EmptyState
              title="No players assigned"
              detail={tournament.player_ids.length > 0 ? "Assigned tournament players will appear here." : "Players appear here once they are assigned to a roster or a match."}
            />
          ) : (
            tournamentPlayers.map((player) => (
              <div key={player.id} className="border border-neutral-800 bg-surface-container-low px-4 py-4 text-sm">
                {player.name}
              </div>
            ))
          )}
        </section>
      ) : null}
    </main>
  );
}
