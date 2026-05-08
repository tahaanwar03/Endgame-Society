"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useGames, useMatches, usePlayers, useTournaments } from "@/lib/firestore-hooks";
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

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "Unscheduled";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* IntersectionObserver hook for entry animation */
function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in-view"); observer.disconnect(); } },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`animate-fade-up ${className}`}>{children}</div>;
}

export function TournamentDashboard({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<Tab>("standings");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const tournaments = useTournaments();
  const players = usePlayers();
  const matches = useMatches(tournamentId);
  const games = useGames(tournamentId);

  if (tournaments.loading || players.loading || matches.loading || games.loading) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <LoadingState label="Loading tournament" />
      </main>
    );
  }

  const error = tournaments.error || players.error || matches.error || games.error;
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

  if (tournament.source === "lichess") {
    return (
      <LichessTournamentDashboard
        tournament={tournament}
        games={games.data}
        tab={tab}
        setTab={setTab}
        selectedPlayerId={selectedPlayerId}
        setSelectedPlayerId={setSelectedPlayerId}
      />
    );
  }

  const stageSections = groupMatchesByStage(tournament, matches.data);
  const rosterGroups = getTournamentPlayersByGroup(tournament, players.data);
  const standingsByGroup = buildStandingsByGroup(tournament, players.data, matches.data);
  const totalRosteredPlayers = Array.from(rosterGroups.grouped.values()).reduce((sum, group) => sum + group.length, 0) + rosterGroups.unassigned.length;
  const selectedPlayerName = selectedPlayerId ? getPlayerName(players.data, selectedPlayerId) : null;

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-14">
      {/* ── Tournament header ────────────────────────────── */}
      <AnimatedSection className="mb-10">
        <Link
          href="/tournaments"
          className="mb-6 inline-flex min-h-9 items-center gap-2 border border-white/[0.08] px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-500 transition hover:border-[#b79262]/50 hover:text-[#f2ca50]"
        >
          ← Tournaments
        </Link>
        {/* Gold hairline left accent — matches hero divider style */}
        <div className="border-l-2 border-[#b79262]/60 pl-4">
          <div className="mb-2 flex items-center gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-neutral-600">
              Tournament Dashboard
            </p>
            <StatusBadge status={tournament.status} />
          </div>
          <h1 className="font-serif text-3xl uppercase tracking-[0.04em] text-gold-gradient leading-tight md:text-[2.6rem]">
            {tournament.name}
          </h1>
          <p className="mt-2 text-xs text-neutral-600 tracking-[0.12em]">
            {formatDate(tournament.date)}{tournament.rounds ? ` · ${tournament.rounds} rounds` : ""}
          </p>
        </div>
        {/* Summary chips — mobile only */}
        <div className="mt-5 grid grid-cols-3 gap-2 md:hidden">
          <SummaryChip label="Players" value={String(totalRosteredPlayers)} />
          <SummaryChip label="Stage" value={tournament.stages[0]?.name ?? "—"} />
          <SummaryChip label="Rounds" value={String(tournament.rounds)} />
        </div>
      </AnimatedSection>

      {/* ── Tab navigation ───────────────────────────────── */}
      <div className="sticky top-16 z-20 mb-8 flex border-b border-white/[0.06] bg-[#0e0e0e]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); if (item.id !== "fixtures") setSelectedPlayerId(null); }}
            className={`min-h-11 flex-1 text-center text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 md:min-h-12 ${
              tab === item.id
                ? "border-b-2 border-[#b79262] text-[#f2ca50]"
                : "text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Standings ────────────────────────────────────── */}
      {tab === "standings" && (
        <section className="space-y-5">
          {standingsByGroup.every((g) => g.players.length === 0) ? (
            <EmptyState title="No group standings yet" detail="Assign players to groups and record group-stage results in admin." />
          ) : (
            standingsByGroup.map((group) => (
              <AnimatedSection key={group.groupCode}>
                <div className="overflow-hidden ring-1 ring-white/[0.06]">
                  {/* Group heading */}
                  <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
                    <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">
                      Group {group.groupCode}
                    </h2>
                  </div>
                  {group.standings.length === 0 ? (
                    <div className="p-6 text-sm text-neutral-600">No completed group matches yet.</div>
                  ) : (
                    <table className="w-full table-fixed text-left text-[11px] md:text-sm">
                      <thead className="bg-[#0d0d0d] text-[9px] uppercase tracking-[0.14em] text-neutral-600 md:text-[10px]">
                        <tr>
                          <th className="w-[12%] px-4 py-3 text-center">Rk</th>
                          <th className="w-[40%] px-4 py-3">Player</th>
                          <th className="w-[12%] px-3 py-3 text-right">Pts</th>
                          <th className="w-[9%] px-2 py-3 text-center">P</th>
                          <th className="w-[9%] px-2 py-3 text-center">W</th>
                          <th className="w-[9%] px-2 py-3 text-center">D</th>
                          <th className="w-[9%] px-2 py-3 text-center">L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {group.standings.map((standing, index) => (
                          <tr key={standing.player.id} className="transition-colors duration-150 hover:bg-[#b79262]/[0.03]">
                            <td className="px-4 py-3 text-center font-serif font-bold text-[#f2ca50] md:py-4">{index + 1}</td>
                            <td className="px-4 py-3 md:py-4">
                              <button
                                onClick={() => { setTab("fixtures"); setSelectedPlayerId(standing.player.id); }}
                                className="block w-full truncate text-left font-semibold text-neutral-300 transition-colors duration-150 hover:text-[#f2ca50]"
                              >
                                {standing.player.name}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-[#f2ca50] md:py-4">{standing.points}</td>
                            <td className="px-2 py-3 text-center text-neutral-500 md:py-4">{standing.played}</td>
                            <td className="px-2 py-3 text-center text-neutral-500 md:py-4">{standing.wins}</td>
                            <td className="px-2 py-3 text-center text-neutral-500 md:py-4">{standing.draws}</td>
                            <td className="px-2 py-3 text-center text-neutral-500 md:py-4">{standing.losses}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </AnimatedSection>
            ))
          )}
        </section>
      )}

      {/* ── Fixtures ─────────────────────────────────────── */}
      {tab === "fixtures" && (
        <section className="space-y-5">
          {selectedPlayerId && (
            <AnimatedSection>
              <div className="flex items-center justify-between border border-[#b79262]/20 bg-[#b79262]/[0.04] px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2ca50]">
                  Viewing: {selectedPlayerName}
                </span>
                <button
                  onClick={() => setSelectedPlayerId(null)}
                  className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-600 underline underline-offset-4 hover:text-neutral-300 transition-colors"
                >
                  Show all
                </button>
              </div>
            </AnimatedSection>
          )}

          {matches.data.length === 0 ? (
            <EmptyState title="No fixtures created" detail="Admin-created matches will appear here by stage and group." />
          ) : (
            stageSections
              .map((section) => {
                if (isGroupStageSection(section)) {
                  const filteredGroups = section.groupSections
                    .map((g) => ({ ...g, matches: g.matches.filter((m) => !selectedPlayerId || m.player1_id === selectedPlayerId || m.player2_id === selectedPlayerId) }))
                    .filter((g) => g.matches.length > 0);
                  return filteredGroups.length > 0 ? { ...section, groupSections: filteredGroups } : null;
                }
                const filteredMatches = section.matches.filter((m) => !selectedPlayerId || m.player1_id === selectedPlayerId || m.player2_id === selectedPlayerId);
                return filteredMatches.length > 0 ? { ...section, matches: filteredMatches } : null;
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)
              .map((section) => (
                <AnimatedSection key={section.stage.id}>
                  <div className="ring-1 ring-white/[0.06]">
                    <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
                      <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
                      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">{section.stage.name}</h2>
                    </div>
                    {isGroupStageSection(section) ? (
                      <div className="space-y-5 p-5">
                        {section.groupSections.map((g) => (
                          <div key={g.groupCode}>
                            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-600">Group {g.groupCode}</p>
                            <div className="divide-y divide-white/[0.04] ring-1 ring-white/[0.05]">
                              {g.matches.map((match) => (
                                <FixtureRow key={match.id} matchId={match.id} player1={formatFixturePlayerName(match.player1_id, players.data)} player2={formatFixturePlayerName(match.player2_id, players.data)} result={match.result ?? null} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.04]">
                        {section.matches.map((match) => (
                          <FixtureRow key={match.id} matchId={match.id} player1={formatFixturePlayerName(match.player1_id, players.data)} player2={formatFixturePlayerName(match.player2_id, players.data)} result={match.result ?? null} />
                        ))}
                      </div>
                    )}
                  </div>
                </AnimatedSection>
              ))
          )}
        </section>
      )}

      {/* ── Players ──────────────────────────────────────── */}
      {tab === "players" && (
        <section className="space-y-5">
          {Array.from(rosterGroups.grouped.values()).every((g) => g.length === 0) && rosterGroups.unassigned.length === 0 ? (
            <EmptyState title="No players assigned" detail="Assigned tournament players will appear here grouped by stage groups." />
          ) : (
            <>
              {Array.from(rosterGroups.grouped.entries()).map(([groupCode, groupPlayers]) => (
                <AnimatedSection key={groupCode}>
                  <div className="ring-1 ring-white/[0.06]">
                    <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
                      <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
                      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">Group {groupCode}</h2>
                    </div>
                    <div className="grid gap-px bg-white/[0.04] md:grid-cols-2">
                      {groupPlayers.map((player) => (
                        <div key={player.id} className="bg-[#131313] px-5 py-4 text-sm font-medium text-neutral-300">{player.name}</div>
                      ))}
                    </div>
                  </div>
                </AnimatedSection>
              ))}
              <AnimatedSection>
                <div className="ring-1 ring-white/[0.06]">
                  <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-600">Unassigned</h2>
                  </div>
                  {rosterGroups.unassigned.length === 0 ? (
                    <p className="p-5 text-sm text-neutral-600">Every rostered player is placed in a group.</p>
                  ) : (
                    <div className="grid gap-px bg-white/[0.04] md:grid-cols-2">
                      {rosterGroups.unassigned.map((player) => (
                        <div key={player.id} className="bg-[#131313] px-5 py-4 text-sm font-medium text-neutral-300">{player.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedSection>
            </>
          )}
        </section>
      )}
    </main>
  );
}

/* ── Lichess Dashboard ───────────────────────────────────── */
function LichessTournamentDashboard({
  tournament, games, tab, setTab, selectedPlayerId, setSelectedPlayerId
}: {
  tournament: ReturnType<typeof useTournaments>["data"][number];
  games: ReturnType<typeof useGames>["data"];
  tab: Tab;
  setTab: (tab: Tab) => void;
  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;
}) {
  const clockLabel = tournament.clock ? `${Math.floor(tournament.clock.limit / 60)}+${tournament.clock.increment}` : "Unspecified";
  const filteredGames = games.filter((g) => !selectedPlayerId || g.white.toLowerCase() === selectedPlayerId.toLowerCase() || g.black.toLowerCase() === selectedPlayerId.toLowerCase());

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-14">
      {/* Header */}
      <AnimatedSection className="mb-10">
        <Link
          href="/tournaments"
          className="mb-6 inline-flex min-h-9 items-center gap-2 border border-white/[0.08] px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-500 transition hover:border-[#b79262]/50 hover:text-[#f2ca50]"
        >
          ← Tournaments
        </Link>
        <div className="border-l-2 border-[#b79262]/60 pl-4">
          <div className="mb-2 flex items-center gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-neutral-600">Online · Lichess</p>
            <StatusBadge status={tournament.status} />
          </div>
          <h1 className="font-serif text-3xl uppercase tracking-[0.04em] text-gold-gradient leading-tight md:text-[2.6rem]">
            {tournament.name}
          </h1>
          <p className="mt-2 text-xs text-neutral-600 tracking-[0.12em]">{formatDate(tournament.date)}</p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 md:hidden">
          <SummaryChip label="Players" value={String(tournament.standings.length)} />
          <SummaryChip label="Clock" value={clockLabel} />
          <SummaryChip label="Games" value={String(games.length)} />
        </div>
      </AnimatedSection>

      {/* Tabs */}
      <div className="sticky top-16 z-20 mb-8 flex border-b border-white/[0.06] bg-[#0e0e0e]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); if (item.id !== "fixtures") setSelectedPlayerId(null); }}
            className={`min-h-11 flex-1 text-center text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 md:min-h-12 ${
              tab === item.id ? "border-b-2 border-[#b79262] text-[#f2ca50]" : "text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Standings */}
      {tab === "standings" && (
        <AnimatedSection>
          <div className="ring-1 ring-white/[0.06]">
            <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
              <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">Live standings snapshot</h2>
            </div>
            {tournament.standings.length === 0 ? (
              <p className="p-6 text-sm text-neutral-600">No standings snapshot has been synced yet.</p>
            ) : (
              <table className="w-full table-fixed text-left text-[11px] md:text-sm">
                <thead className="bg-[#0d0d0d] text-[9px] uppercase tracking-[0.14em] text-neutral-600 md:text-[10px]">
                  <tr>
                    <th className="w-[14%] px-4 py-3 text-center">Rk</th>
                    <th className="w-[56%] px-4 py-3">Player</th>
                    <th className="w-[30%] px-4 py-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {tournament.standings.map((standing) => (
                    <tr key={standing.userId} className="transition-colors duration-150 hover:bg-[#b79262]/[0.03]">
                      <td className="px-4 py-3 text-center font-serif font-bold text-[#f2ca50] md:py-4">{standing.rank}</td>
                      <td className="px-4 py-3 md:py-4">
                        <button
                          onClick={() => { setTab("fixtures"); setSelectedPlayerId(standing.userId); }}
                          className="block w-full truncate text-left font-semibold text-neutral-300 transition-colors duration-150 hover:text-[#f2ca50]"
                        >
                          {standing.username}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#f2ca50] md:py-4">{standing.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </AnimatedSection>
      )}

      {/* Fixtures / Games */}
      {tab === "fixtures" && (
        <section className="space-y-4">
          <AnimatedSection>
            <div className="ring-1 ring-white/[0.06]">
              <div className="flex items-center justify-between bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">
                    {selectedPlayerId ? `Matches — ${selectedPlayerId}` : "Archived games"}
                  </h2>
                </div>
                {selectedPlayerId && (
                  <button onClick={() => setSelectedPlayerId(null)} className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-600 underline underline-offset-4 hover:text-neutral-300 transition-colors">
                    Show all
                  </button>
                )}
              </div>
              {filteredGames.length === 0 ? (
                <p className="p-6 text-sm text-neutral-600">No games found{selectedPlayerId ? " for this player" : ""}.</p>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {filteredGames.map((game) => (
                    <Link
                      key={game.id}
                      href={`/match/${game.id}`}
                      className="group grid grid-cols-[1fr_auto] gap-3 px-5 py-3 text-sm transition-colors duration-150 hover:bg-[#b79262]/[0.03] md:py-4"
                    >
                      <span className="min-w-0 truncate text-neutral-400">
                        <span className={selectedPlayerId && game.white.toLowerCase() === selectedPlayerId.toLowerCase() ? "font-semibold text-neutral-200" : ""}>{game.white}</span>
                        <span className="mx-2 text-neutral-700">vs</span>
                        <span className={selectedPlayerId && game.black.toLowerCase() === selectedPlayerId.toLowerCase() ? "font-semibold text-neutral-200" : ""}>{game.black}</span>
                      </span>
                      <span className="font-bold text-[#f2ca50] group-hover:text-[#f2ca50]">{game.result}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </AnimatedSection>
        </section>
      )}

      {/* Players */}
      {tab === "players" && (
        <AnimatedSection>
          <div className="ring-1 ring-white/[0.06]">
            <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
              <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">Participants</h2>
            </div>
            {tournament.standings.length === 0 ? (
              <p className="p-6 text-sm text-neutral-600">No participant snapshot has been synced yet.</p>
            ) : (
              <div className="grid gap-px bg-white/[0.04] md:grid-cols-2">
                {tournament.standings.map((standing) => (
                  <div key={standing.userId} className="bg-[#131313] px-5 py-4">
                    <p className="font-semibold text-neutral-300">{standing.username}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-neutral-600">
                      Rank {standing.rank} · Score {standing.score}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AnimatedSection>
      )}
    </main>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function FixtureRow({ matchId, player1, player2, result }: { matchId: string; player1: string; player2: string; result: string | null }) {
  return (
    <Link
      href={`/match/${matchId}`}
      className="group grid grid-cols-[1fr_auto] gap-3 px-5 py-3 text-sm transition-colors duration-150 hover:bg-[#b79262]/[0.03] md:py-4"
    >
      <span className="min-w-0 truncate text-neutral-400">
        {player1} <span className="mx-2 text-neutral-700">vs</span> {player2}
      </span>
      <span className="font-bold text-[#f2ca50]">{result ?? "Pending"}</span>
    </Link>
  );
}

function formatFixturePlayerName(playerId: string, players: Parameters<typeof getPlayerName>[0]) {
  if (!playerId) return "TBD";
  const name = getPlayerName(players, playerId);
  return name === "Unknown player" ? "TBD" : name;
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="ring-1 ring-white/[0.06] bg-[#0f0f0f] px-3 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-600">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-300">{value}</p>
    </div>
  );
}
