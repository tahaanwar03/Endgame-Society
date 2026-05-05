import { AppHeader } from "@/components/AppHeader";
import { TournamentList } from "@/components/TournamentList";

export default function TournamentsPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-12">
        <div className="mb-8 border-l-2 border-primary pl-4">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Tournament Archive</p>
          <h1 className="mt-2 font-serif text-4xl text-on-surface">Society Tournaments</h1>
        </div>
        <TournamentList />
      </main>
    </>
  );
}
