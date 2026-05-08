"use client";

import Link from "next/link";
import { useEffect, useRef, useMemo, useState, type ReactNode } from "react";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useTournaments } from "@/lib/firestore-hooks";
import type { Tournament } from "@/lib/types";

type SourceFilter = "manual" | "lichess";
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

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "Unscheduled";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* Very small hook — uses IntersectionObserver to add .in-view class.
   This triggers the CSS animation-play-state without any scroll listener. */
function useInViewAnimation(ref: React.RefObject<Element | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in-view"); observer.disconnect(); } },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

function AnimatedCard({ children, delay }: { children: ReactNode; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useInViewAnimation(ref as React.RefObject<Element>);
  return (
    <div
      ref={ref}
      className={`animate-fade-up delay-${delay}`}
    >
      {children}
    </div>
  );
}

export function TournamentList() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("manual");
  const [timeControlFilter, setTimeControlFilter] = useState<TimeControlFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const { data: tournaments, loading, error } = useTournaments();

  const filteredAndSorted = useMemo(() => {
    let result = tournaments.filter((t) => {
      if (t.source !== sourceFilter) return false;
      if (sourceFilter === "lichess" && timeControlFilter !== "all") {
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

  const delays = [0, 60, 120, 180, 240, 300] as const;

  return (
    <section>
      {/* ── Filter bar ───────────────────────────────────── */}
      <div className="mb-10 space-y-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          {/* Type toggle */}
          <div className="flex gap-0">
            <TypeTab active={sourceFilter === "manual"} onClick={() => { setSourceFilter("manual"); setTimeControlFilter("all"); }}>
              Over the Board
            </TypeTab>
            <TypeTab active={sourceFilter === "lichess"} onClick={() => setSourceFilter("lichess")}>
              Online
            </TypeTab>
          </div>

          {/* Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-600">Sort</span>
            {([["date-desc", "Newest"], ["date-asc", "Oldest"], ["name-asc", "A–Z"], ["status", "Status"]] as const).map(([mode, label]) => (
              <FilterChip key={mode} active={sortMode === mode} onClick={() => setSortMode(mode)}>{label}</FilterChip>
            ))}
          </div>
        </div>

        {/* Online format sub-filter */}
        {sourceFilter === "lichess" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-5">
            <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-600">Format</span>
            {(["all", "bullet", "blitz", "rapid"] as const).map((fc) => (
              <FilterChip key={fc} active={timeControlFilter === fc} onClick={() => setTimeControlFilter(fc)}>
                {fc === "all" ? "All" : fc.charAt(0).toUpperCase() + fc.slice(1)}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {/* ── Count ────────────────────────────────────────── */}
      <p className="mb-6 text-[11px] tracking-[0.14em] text-neutral-600 uppercase font-semibold">
        {filteredAndSorted.length} event{filteredAndSorted.length !== 1 ? "s" : ""}
      </p>

      {filteredAndSorted.length === 0 ? (
        <EmptyState title="No tournaments found" detail="Try a different filter or check back later." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSorted.map((tournament, i) => (
            <AnimatedCard key={tournament.id} delay={delays[Math.min(i, delays.length - 1)]}>
              {/* Double-Bezel card */}
              <Link
                href={`/tournaments/${encodeURIComponent(tournament.id)}`}
                className="group block ring-1 ring-white/[0.06] bg-[#0f0f0f] p-px transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:ring-[#b79262]/40 hover:shadow-[0_0_0_1px_rgba(183,146,98,0.1),0_8px_32px_rgba(0,0,0,0.4)]"
              >
                {/* Inner core */}
                <div className="bg-surface-container-low p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {/* Source label */}
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-500">
                    {tournament.source === "lichess" ? "Online" : "Over the Board"}
                  </p>

                  {/* Name with gold gradient treatment */}
                  <h2 className="mt-3 font-serif text-xl leading-tight text-gold-gradient group-hover:opacity-90 transition-opacity duration-300 md:text-2xl">
                    {tournament.name}
                  </h2>

                  {/* Hairline divider — mirrors hero divider */}
                  <div className="mt-4 h-px bg-gradient-to-r from-[#b79262]/30 to-transparent" />

                  {/* Meta */}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">Date</dt>
                      <dd className="mt-1 text-neutral-300">{formatDate(tournament.date)}</dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600">
                        {tournament.source === "lichess" ? "Clock" : "Rounds"}
                      </dt>
                      <dd className="mt-1 text-neutral-300">
                        {tournament.source === "lichess" ? formatClock(tournament) : tournament.rounds}
                      </dd>
                    </div>
                  </dl>

                  {/* Status badge row */}
                  <div className="mt-4 flex items-center justify-between">
                    <StatusBadge status={tournament.status} />
                    {/* Diamond glyph — mirrors hero deco */}
                    <span className="h-2 w-2 rotate-45 border border-[#b79262]/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                </div>
              </Link>
            </AnimatedCard>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function TypeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 px-5 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] first:border-r-0 border ${
        active
          ? "border-[#b79262] bg-[#b79262]/10 text-[#f2ca50]"
          : "border-white/[0.08] text-neutral-500 hover:border-[#b79262]/40 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-8 border px-3 text-[9px] font-bold uppercase tracking-[0.16em] transition-all duration-150 active:scale-[0.97] ${
        active
          ? "border-[#b79262]/70 bg-[#b79262]/10 text-[#f2ca50]"
          : "border-white/[0.07] text-neutral-600 hover:border-white/20 hover:text-neutral-400"
      }`}
    >
      {children}
    </button>
  );
}
