import type { TournamentStatus } from "@/lib/types";

const statusClass: Record<TournamentStatus, string> = {
  created: "border-outline-variant text-on-surface-variant",
  upcoming: "border-outline-variant text-on-surface-variant",
  ongoing: "border-primary/50 bg-primary/10 text-primary",
  completed: "border-neutral-700 text-neutral-400",
  finished: "border-neutral-700 text-neutral-400",
  archived: "border-neutral-700 text-neutral-500"
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`inline-flex border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusClass[status]}`}>
      {status}
    </span>
  );
}
