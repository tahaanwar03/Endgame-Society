import type { TournamentStatus } from "@/lib/types";

const statusColors: Record<TournamentStatus, string> = {
  created: "border-white/[0.08] text-neutral-600",
  upcoming: "border-white/[0.08] text-neutral-600",
  ongoing: "border-[#b79262]/40 bg-[#b79262]/5 text-[#f2ca50]",
  completed: "border-white/[0.12] text-neutral-400 font-medium",
  finished: "border-white/[0.12] text-neutral-400 font-medium",
  archived: "border-white/[0.06] text-neutral-700"
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`inline-flex items-center gap-2 border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.24em] ${statusColors[status]}`}>
      {status === "ongoing" && <span className="h-1 w-1 animate-pulse bg-[#b79262]" />}
      {status}
    </span>
  );
}
