"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useMatches, usePlayers, useTournaments } from "@/lib/firestore-hooks";
import {
  buildStandingsByGroup,
  getPlayerName,
  getTournamentPlayersByGroup,
  groupMatchesByStage,
  type GroupStageMatchSection,
  type StageMatchSection
} from "@/lib/standings";

type Tab = "standings" | "fixtures" | "players";

const tabs: { id: Tab; label: string }[] = [
  { id: "standings", label: "Standings" },
  { id: "fixtures", label: "Fixtures" },
  { id: "players", label: "Players" }
];

function isGroupStageSection(section: StageMatchSection): section is GroupStageMatchSection {
  return section.stage.type === "group";
}

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

  const stageSections = groupMatchesByStage(tournament, matches.data);
  const rosterGroups = getTournamentPlayersByGroup(tournament, players.data);
  const standingsByGroup = buildStandingsByGroup(tournament, players.data, matches.data);

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
        <section className="space-y-5">
          {standingsByGroup.every((group) => group.players.length === 0) ? (
            <EmptyState title="No group standings yet" detail="Assign players to groups and record group-stage results in admin." />
          ) : (
            standingsByGroup.map((group) => (
              <div key={group.groupCode} className="overflow-hidden border border-neutral-800 bg-surface-container-low">
                <h2 className="border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Group {group.groupCode}
                </h2>
                {group.players.length === 0 ? (
                  <div className="p-6 text-sm text-on-surface-variant">No players assigned.</div>
                ) : group.standings.length === 0 ? (
                  <div className="p-6 text-sm text-on-surface-variant">No completed group matches yet.</div>
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
                        {group.standings.map((standing, index) => (
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
              </div>
            ))
          )}
        </section>
      ) : null}

      {tab === "fixtures" ? (
        <section className="space-y-5">
          {matches.data.length === 0 ? (
            <EmptyState title="No fixtures created" detail="Admin-created matches will appear here by stage and group." />
          ) : (
            stageSections.map((section) => (
              <div key={section.stage.id} className="border border-neutral-800 bg-surface-container-low">
                <h2 className="border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  {section.stage.name}
                </h2>
                {isGroupStageSection(section) ? (
                  <div className="space-y-5 p-4">
                    {section.groupSections.map((groupSection) => (
                      <div key={groupSection.groupCode}>
                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Group {groupSection.groupCode}</p>
                        {groupSection.matches.length === 0 ? (
                          <p className="text-sm text-on-surface-variant">No fixtures yet.</p>
                        ) : (
                          <div className="divide-y divide-neutral-900 border border-neutral-900">
                            {groupSection.matches.map((match) => (
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
                        )}
                      </div>
                    ))}
                  </div>
                ) : section.matches.length === 0 ? (
                  <div className="p-4 text-sm text-on-surface-variant">No fixtures yet.</div>
                ) : (
                  <div className="divide-y divide-neutral-900">
                    {section.matches.map((match) => (
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
                )}
              </div>
            ))
          )}
        </section>
      ) : null}

      {tab === "players" ? (
        <section className="space-y-5">
          {Array.from(rosterGroups.grouped.values()).every((group) => group.length === 0) && rosterGroups.unassigned.length === 0 ? (
            <EmptyState title="No players assigned" detail="Assigned tournament players will appear here grouped by stage groups." />
          ) : (
            <>
              {Array.from(rosterGroups.grouped.entries()).map(([groupCode, groupPlayers]) => (
                <div key={groupCode} className="border border-neutral-800 bg-surface-container-low">
                  <h2 className="border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                    Group {groupCode}
                  </h2>
                  {groupPlayers.length === 0 ? (
                    <p className="p-4 text-sm text-on-surface-variant">No players assigned.</p>
                  ) : (
                    <div className="grid gap-px bg-neutral-900 md:grid-cols-2">
                      {groupPlayers.map((player) => (
                        <div key={player.id} className="bg-surface-container-low px-4 py-4 text-sm">
                          {player.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="border border-neutral-800 bg-surface-container-low">
                <h2 className="border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                  Unassigned
                </h2>
                {rosterGroups.unassigned.length === 0 ? (
                  <p className="p-4 text-sm text-on-surface-variant">Every rostered player is already placed in a group.</p>
                ) : (
                  <div className="grid gap-px bg-neutral-900 md:grid-cols-2">
                    {rosterGroups.unassigned.map((player) => (
                      <div key={player.id} className="bg-surface-container-low px-4 py-4 text-sm">
                        {player.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
