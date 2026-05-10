"use client";

import { useMemo, useState } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { useTournaments, useMatches, usePlayers } from "@/lib/firestore-hooks";
import { computeStandings } from "@/lib/standings";
import type { Player } from "@/lib/types";

function leaderboardPoints(rank: number) {
  if (rank === 1) return 10;
  if (rank === 2) return 5;
  if (rank === 3) return 3;
  return 1;
}

type OtbEntry = {
  player: Player;
  points: number;
  played: number;
  gold: number;
  silver: number;
  bronze: number;
};

type OnlineEntry = {
  username: string;
  points: number;
  played: number;
  gold: number;
  silver: number;
  bronze: number;
};

function denseRanks(entries: { points: number }[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    ranks.push(i === 0 ? 1 : entries[i - 1].points === entries[i].points ? ranks[i - 1] : i + 1);
  }
  return ranks;
}

function PointsKey() {
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {[
        { label: "1st place", pts: "10 pts", cls: "text-[#f2ca50]" },
        { label: "2nd place", pts: "5 pts", cls: "text-[#b0b0b0]" },
        { label: "3rd place", pts: "3 pts", cls: "text-[#cd7f32]" },
        { label: "4th+", pts: "1 pt", cls: "text-neutral-500" },
      ].map(({ label, pts, cls }) => (
        <div key={label} className="flex items-center gap-2 border border-white/[0.06] bg-[#0f0f0f] px-3 py-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-600">{label}</span>
          <span className={`text-xs font-bold ${cls}`}>{pts}</span>
        </div>
      ))}
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f0f0f] p-px ring-1 ring-white/[0.06]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-[#0a0a0a]">
              <th className="px-4 py-3 text-left   text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">#</th>
              <th className="px-4 py-3 text-left   text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">Player</th>
              <th className="px-4 py-3 text-right  text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">Points</th>
              <th className="px-4 py-3 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#f2ca50]/60">1st</th>
              <th className="px-4 py-3 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#b0b0b0]/60">2nd</th>
              <th className="px-4 py-3 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#cd7f32]/60">3rd</th>
              <th className="px-4 py-3 text-right  text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">Events</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function RankCell({ rank }: { rank: number }) {
  return (
    <td className="w-10 px-4 py-3">
      <span className={`tabular-nums font-bold ${rank === 1 ? "text-[#f2ca50]"
          : rank === 2 ? "text-[#b0b0b0]"
            : rank === 3 ? "text-[#cd7f32]"
              : "text-neutral-600"
        }`}>
        {rank}
      </span>
    </td>
  );
}

function MedalCell({ count, cls }: { count: number; cls: string }) {
  return (
    <td className="px-4 py-3 text-center tabular-nums">
      {count > 0
        ? <span className={`font-medium ${cls}`}>{count}</span>
        : <span className="text-neutral-700">—</span>}
    </td>
  );
}

function OtbTable({ entries }: { entries: OtbEntry[] }) {
  const ranks = denseRanks(entries);
  if (!entries.length)
    return <EmptyState title="No results yet" detail="Leaderboard populates as over-the-board tournaments complete." />;

  return (
    <>
      <TableShell>
        {entries.map((entry, i) => {
          const rank = ranks[i];
          const top3 = rank <= 3;
          return (
            <tr key={entry.player.id} className={`border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.02] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
              <RankCell rank={rank} />
              <td className="px-4 py-3">
                <span className={`font-medium ${top3 ? "text-neutral-100" : "text-neutral-300"}`}>{entry.player.name}</span>
                {entry.player.elo != null && <span className="ml-2 text-[10px] text-neutral-600">{entry.player.elo}</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`tabular-nums font-bold ${top3 ? "text-[#f2ca50]" : "text-neutral-400"}`}>{entry.points}</span>
              </td>
              <MedalCell count={entry.gold} cls="text-[#f2ca50]" />
              <MedalCell count={entry.silver} cls="text-[#b0b0b0]" />
              <MedalCell count={entry.bronze} cls="text-[#cd7f32]" />
              <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{entry.played}</td>
            </tr>
          );
        })}
      </TableShell>
      <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-neutral-700">
        {entries.length} player{entries.length !== 1 ? "s" : ""} ranked &middot; Over-the-board tournaments only
      </p>
    </>
  );
}

function OnlineTable({ entries }: { entries: OnlineEntry[] }) {
  const ranks = denseRanks(entries);
  if (!entries.length)
    return <EmptyState title="No results yet" detail="Leaderboard populates as online tournaments finish." />;

  return (
    <>
      <TableShell>
        {entries.map((entry, i) => {
          const rank = ranks[i];
          const top3 = rank <= 3;
          return (
            <tr key={entry.username} className={`border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.02] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
              <RankCell rank={rank} />
              <td className="px-4 py-3">
                <span className={`font-medium ${top3 ? "text-neutral-100" : "text-neutral-300"}`}>{entry.username}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`tabular-nums font-bold ${top3 ? "text-[#f2ca50]" : "text-neutral-400"}`}>{entry.points}</span>
              </td>
              <MedalCell count={entry.gold} cls="text-[#f2ca50]" />
              <MedalCell count={entry.silver} cls="text-[#b0b0b0]" />
              <MedalCell count={entry.bronze} cls="text-[#cd7f32]" />
              <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{entry.played}</td>
            </tr>
          );
        })}
      </TableShell>
      <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-neutral-700">
        {entries.length} player{entries.length !== 1 ? "s" : ""} ranked &middot; Lichess tournaments only
      </p>
    </>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<"otb" | "online">("otb");

  const { data: tournaments, loading: tl, error: te } = useTournaments();
  const { data: players, loading: pl, error: pe } = usePlayers();
  const { data: matches, loading: ml, error: me } = useMatches();

  const loading = tl || pl || ml;
  const error = te || pe || me;

  const otbEntries = useMemo<OtbEntry[]>(() => {
    const eligible = tournaments.filter(
      (t) => t.source === "manual" && (t.status === "completed" || t.status === "finished" || t.status === "archived")
    );

    const map = new Map<string, OtbEntry>(
      players.map((p) => [p.id, { player: p, points: 0, played: 0, gold: 0, silver: 0, bronze: 0 }])
    );

    for (const t of eligible) {
      const roster = players.filter((p) => t.player_ids.includes(p.id));
      if (!roster.length) continue;

      const standings = computeStandings(roster, matches.filter((m) => m.tournament_id === t.id));

      let rank = 1;
      for (let i = 0; i < standings.length; i++) {
        if (i > 0 && standings[i].points < standings[i - 1].points) rank = i + 1;
        const entry = map.get(standings[i].player.id);
        if (!entry) continue;
        entry.points += leaderboardPoints(rank);
        entry.played += 1;
        if (rank === 1) entry.gold++;
        else if (rank === 2) entry.silver++;
        else if (rank === 3) entry.bronze++;
      }
    }

    return [...map.values()]
      .filter((e) => e.played > 0)
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.player.name.localeCompare(b.player.name));
  }, [tournaments, players, matches]);

  const onlineEntries = useMemo<OnlineEntry[]>(() => {
    const eligible = tournaments.filter(
      (t) => t.source === "lichess" && (t.status === "finished" || t.status === "archived" || t.status === "completed")
    );

    const map = new Map<string, OnlineEntry>();

    for (const t of eligible) {
      if (!t.standings.length) continue;

      for (const s of t.standings) {
        if (!s.username) continue;
        const key = s.username.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { username: s.username, points: 0, played: 0, gold: 0, silver: 0, bronze: 0 });
        }
        const entry = map.get(key)!;
        entry.points += leaderboardPoints(s.rank);
        entry.played += 1;
        if (s.rank === 1) entry.gold++;
        else if (s.rank === 2) entry.silver++;
        else if (s.rank === 3) entry.bronze++;
      }
    }

    return [...map.values()]
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.username.localeCompare(b.username));
  }, [tournaments]);

  if (loading) return <LoadingState label="Computing leaderboard" />;
  if (error) return <EmptyState title="Leaderboard unavailable" detail={error} />;

  return (
    <section>
      {/* Tab toggle */}
      <div className="mb-8 flex gap-0">
        <button
          type="button"
          onClick={() => setTab("otb")}
          className={`flex-1 min-h-10 px-5 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 border first:border-r-0 ${tab === "otb"
              ? "border-[#b79262] bg-[#b79262]/10 text-[#f2ca50]"
              : "border-white/[0.08] text-neutral-500 hover:border-[#b79262]/40 hover:text-neutral-300"
            }`}
        >
          Over the Board
        </button>
        <button
          type="button"
          onClick={() => setTab("online")}
          className={`flex-1 min-h-10 px-5 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 border ${tab === "online"
              ? "border-[#b79262] bg-[#b79262]/10 text-[#f2ca50]"
              : "border-white/[0.08] text-neutral-500 hover:border-[#b79262]/40 hover:text-neutral-300"
            }`}
        >
          Online
        </button>
      </div>

      <PointsKey />

      {tab === "otb"
        ? <OtbTable entries={otbEntries} />
        : <OnlineTable entries={onlineEntries} />}
    </section>
  );
}
