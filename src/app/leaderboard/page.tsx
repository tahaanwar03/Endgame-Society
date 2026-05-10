import { AppHeader } from "@/components/AppHeader";
import { Leaderboard } from "@/components/Leaderboard";

export default function LeaderboardPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-16">
        <div className="mb-10 animate-fade-up in-view border-l-2 border-[#b79262]/60 pl-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-600">
            Endgame Society
          </p>
          <h1 className="mt-2 font-serif text-4xl uppercase tracking-[0.04em] text-gold-gradient leading-tight md:text-5xl">
            Leaderboard
          </h1>
        </div>
        <Leaderboard />
      </main>
    </>
  );
}
