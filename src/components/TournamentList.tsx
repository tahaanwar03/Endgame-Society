"use client";

import Link from "next/link";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useTournaments } from "@/lib/firestore-hooks";

export function TournamentList() {
  const { data: tournaments, loading, error } = useTournaments();

  if (loading) {
    return <LoadingState label="Loading tournaments" />;
  }

  if (error) {
    return <EmptyState title="Tournament data unavailable" detail={error} />;
  }

  if (tournaments.length === 0) {
    return <EmptyState title="No tournaments published" detail="Admin-created tournaments will appear here in real time." />;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tournaments.map((tournament) => (
        <Link
          key={tournament.id}
          href={`/tournaments/${encodeURIComponent(tournament.id)}`}
          className="group border border-neutral-800 bg-surface-container-low p-5 transition-colors hover:border-primary/60"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-2xl text-on-surface group-hover:text-primary">{tournament.name}</h2>
            <StatusBadge status={tournament.status} />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Date</dt>
              <dd className="mt-1">{tournament.date || "Unscheduled"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Rounds</dt>
              <dd className="mt-1">{tournament.rounds}</dd>
            </div>
          </dl>
        </Link>
      ))}
    </section>
  );
}
