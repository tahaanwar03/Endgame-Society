"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useTournaments } from "@/lib/firestore-hooks";
import type { Tournament } from "@/lib/types";

type SourceFilter = "all" | "manual" | "lichess";
type TimeControlFilter = "all" | "bullet" | "blitz" | "rapid";
type SortMode = "date-desc" | "date-asc" | "name-asc" | "status";

function getTimeControlCategory(tournament: Tournament): TimeControlFilter {
  if (tournament.source !== "lichess" || !tournament.clock) return "all";
  const totalSeconds = tournament.clock.limit + tournament.clock.increment * 40;
  if (totalSeconds < 180) return "bullet";
  if (totalSeconds < 480) return "blitz";
  if (totalSeconds < 1500) return "rapid";
  return "all";
}

function formatClock(tournament: Tournament): string {
  if (!tournament.clock) return "—";
  const minutes = Math.floor(tournament.clock.limit / 60);
  const inc = tournament.clock.increment;
  return inc > 0 ? `${minutes}+${inc}` : `${minutes}m`;
}

export function TournamentList() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [timeControlFilter, setTimeControlFilter] = useState<TimeControlFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const { data: tournaments, loading, error } = useTournaments();

  const hasLichess = tournaments.some((t) => t.source === "lichess");

  const filteredAndSorted = useMemo(() => {
    let result = tournaments.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (timeControlFilter !== "all") {
        if (t.source !== "lichess") return false;
        if (getTimeControlCategory(t) !== timeControlFilter) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "date-desc") return (b.date || "").localeCompare(a.date || "");
      if (sortMode === "date-asc") return (a.date || "").localeCompare(b.date || "");
      if (sortMode === "name-asc") return a.name.localeCompare(b.name);
      if (sortMode === "status") {
        const order: Record<string, number> = { ongoing: 0, created: 1, upcoming: 2, completed: 3, finished: 3, archived: 4 };
        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
      }
      return 0;
    });

    return result;
  }, [tournaments, sourceFilter, timeControlFilter, sortMode]);

  if (loading) return <LoadingState label="Loading tournaments" />;
  if (error) return <EmptyState title="Tournament data unavailable" detail={error} />;
  if (tournaments.length === 0) {
    return <EmptyState title="No tournaments published" detail="Admin-created tournaments will appear here in real time." />;
  }

  return (
    <section>
      {/* Filter + Sort bar */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          {/* Source filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500 w-16 shrink-0">Type</span>
            <FilterChip active={sourceFilter === "all"} onClick={() => { setSourceFilter("all"); setTimeControlFilter("all"); }}>All Events</FilterChip>
            <FilterChip active={sourceFilter === "lichess"} onClick={() => setSourceFilter("lichess")}>Online</FilterChip>
            <FilterChip active={sourceFilter === "manual"} onClick={() => { setSourceFilter("manual"); setTimeControlFilter("all"); }}>Over the Board</FilterChip>
          </div>

          {/* Time control filter — only visible when online or all (with lichess events) */}
          {(sourceFilter === "lichess" || (sourceFilter === "all" && hasLichess)) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500 w-16 shrink-0">Format</span>
              <FilterChip active={timeControlFilter === "all"} onClick={() => setTimeControlFilter("all")}>All</FilterChip>
              <FilterChip active={timeControlFilter === "bullet"} onClick={() => setTimeControlFilter("bullet")}>Bullet</FilterChip>
              <FilterChip active={timeControlFilter === "blitz"} onClick={() => setTimeControlFilter("blitz")}>Blitz</FilterChip>
              <FilterChip active={timeControlFilter === "rapid"} onClick={() => setTimeControlFilter("rapid")}>Rapid</FilterChip>
            </div>
          )}
        </div>

        {/* Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Sort</span>
          {([
            ["date-desc", "Newest first"],
            ["date-asc", "Oldest first"],
            ["name-asc", "Name A–Z"],
            ["status", "By status"]
          ] as const).map(([mode, label]) => (
            <FilterChip key={mode} active={sortMode === mode} onClick={() => setSortMode(mode)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="mb-4 text-xs text-neutral-500">
        {filteredAndSorted.length} of {tournaments.length} event{tournaments.length !== 1 ? "s" : ""}
      </p>

      {filteredAndSorted.length === 0 ? (
        <EmptyState title="No tournaments in this view" detail="Try a different filter combination." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSorted.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/tournaments/${encodeURIComponent(tournament.id)}`}
              className="group border border-neutral-800 bg-surface-container-low p-5 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                    {tournament.source === "lichess" ? "Online" : "Over the Board"}
                  </p>
                  <h2 className="mt-2 font-serif text-xl leading-tight text-on-surface group-hover:text-primary md:text-2xl">
                    {tournament.name}
                  </h2>
                </div>
                <StatusBadge status={tournament.status} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Date</dt>
                  <dd className="mt-1">{tournament.date || "Unscheduled"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                    {tournament.source === "lichess" ? "Clock" : "Rounds"}
                  </dt>
                  <dd className="mt-1">
                    {tournament.source === "lichess" ? formatClock(tournament) : tournament.rounds}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 border px-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
        active ? "border-primary bg-primary text-[#111111]" : "border-neutral-800 text-on-surface-variant hover:border-neutral-600"
      }`}
    >
      {children}
    </button>
  );
}
