"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { logout, useAuthUser } from "@/lib/auth-hooks";
import {
  addPlayerToTournament,
  createMatch,
  createPlayer,
  createPlayersBulk,
  createTournament,
  deleteMatch,
  deletePlayerAndCleanup,
  deleteTournamentWithMatches,
  removePlayerFromTournament,
  setTournamentPlayerGroup,
  updateMatch,
  updatePlayer,
  updateTournament,
  useMatches,
  usePlayers,
  useTournaments
} from "@/lib/firestore-hooks";
import {
  createDefaultStages,
  getPlayerName,
  slugifyStageName
} from "@/lib/standings";
import type {
  Match,
  MatchResult,
  Player,
  Tournament,
  TournamentStage,
  TournamentStatus
} from "@/lib/types";

const statuses: Array<{ value: TournamentStatus; label: string }> = [
  { value: "created", label: "Created" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "finished", label: "Finished" },
  { value: "archived", label: "Archived" }
];
const results: Array<{ value: MatchResult; label: string }> = [
  { value: "1-0", label: "1-0 (White Win)" },
  { value: "0-1", label: "0-1 (Black Win)" },
  { value: "1/2-1/2", label: "1/2-1/2 (Draw)" },
  { value: null, label: "Pending" }
];
const rosterSortModes = ["A-Z", "ELO high to low", "ELO low to high"] as const;

type RosterSortMode = (typeof rosterSortModes)[number];
type AdminScreen = "roster" | "tournaments" | "tournament" | "match" | "lichess-sync";

/* -------------------------------------------------------------------------- */
/* Main Admin Shell                                                           */
/* -------------------------------------------------------------------------- */

export function AdminPanel() {
  const auth = useAuthUser();
  const tournaments = useTournaments();
  const players = usePlayers();
  const matches = useMatches();
  const [message, setMessage] = useState<string | null>(null);
  const [screen, setScreen] = useState<AdminScreen>("roster");
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  if (auth.loading) {
    return <AdminShell title="Checking access">Initializing secure session...</AdminShell>;
  }

  if (!auth.user) {
    return (
      <AdminShell title="Admin Portal">
        <p className="text-neutral-400 font-sans">Authorized personnel only. Please verify your credentials.</p>
        <Link href="/login" className="mt-8 inline-flex min-h-12 items-center bg-gradient-to-r from-[#b79262] to-[#f2ca50] px-8 text-[11px] font-bold uppercase tracking-[0.3em] text-black hover:opacity-90 transition-all duration-300">
          Login
        </Link>
      </AdminShell>
    );
  }

  if (!auth.isAdmin) {
    return (
      <AdminShell title="Unauthorized">
        <p className="text-neutral-400 font-sans">The account <span className="text-neutral-200">({auth.user.email})</span> does not have administrative privileges.</p>
        <button onClick={() => logout()} className="mt-8 border border-white/[0.1] px-8 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400 font-sans">
          Sign out
        </button>
      </AdminShell>
    );
  }

  const manualTournaments = tournaments.data.filter((item) => item.source !== "lichess");
  const error = tournaments.error || players.error || matches.error;
  const selectedTournament = manualTournaments.find((item) => item.id === selectedTournamentId) ?? null;
  const selectedMatch = matches.data.find((item) => item.id === selectedMatchId) ?? null;
  const tournamentForMatch = selectedTournament ?? manualTournaments.find((item) => item.id === selectedMatch?.tournament_id) ?? null;
  
  const mobileBackAction =
    screen === "match"
      ? {
          label: "Back to tournament",
          onClick: () => {
            if (!tournamentForMatch) {
              setScreen("tournaments");
              return;
            }
            setSelectedTournamentId(tournamentForMatch.id);
            setScreen("tournament");
          }
        }
      : screen === "tournament"
        ? {
            label: "Back to tournament library",
            onClick: () => setScreen("tournaments")
          }
        : null;

  const renderScreen = () => {
    if (screen === "roster") {
      return <PlayerRosterScreen players={players.data} tournaments={manualTournaments} matches={matches.data} onDone={setMessage} />;
    }

    if (screen === "lichess-sync") {
      return <LichessSyncScreen onDone={setMessage} />;
    }

    if (screen === "tournaments") {
      return (
        <TournamentLibraryScreen
          tournaments={manualTournaments}
          onDone={setMessage}
          onOpenTournament={(tournamentId) => {
            setSelectedTournamentId(tournamentId);
            setSelectedMatchId(null);
            setScreen("tournament");
          }}
        />
      );
    }

    if (screen === "tournament") {
      if (!selectedTournament) {
        return (
          <EmptyAdminState
            title="Registry Missing"
            detail="The requested tournament record could not be retrieved from the archives."
            actionLabel="Return to Library"
            onAction={() => setScreen("tournaments")}
          />
        );
      }

      return (
        <TournamentDetailScreen
          tournament={selectedTournament}
          players={players.data}
          matches={matches.data.filter((match) => match.tournament_id === selectedTournament.id)}
          onDone={setMessage}
          onBack={() => setScreen("tournaments")}
          onOpenMatch={(matchId) => {
            setSelectedMatchId(matchId);
            setScreen("match");
          }}
        />
      );
    }

    if (!selectedMatch || !tournamentForMatch) {
      return (
        <EmptyAdminState
          title="Match Record Missing"
          detail="The individual encounter record is currently unavailable."
          actionLabel="Return to Tournament"
          onAction={() => setScreen(selectedTournamentId ? "tournament" : "tournaments")}
        />
      );
    }

    return (
      <MatchDetailScreen
        match={selectedMatch}
        tournament={tournamentForMatch}
        players={players.data}
        onDone={setMessage}
        onBack={() => {
          setSelectedTournamentId(tournamentForMatch.id);
          setScreen("tournament");
        }}
        onDelete={() => {
          setSelectedMatchId(null);
          setSelectedTournamentId(tournamentForMatch.id);
          setScreen("tournament");
        }}
      />
    );
  };

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-16">
      {/* Header Section */}
      <section className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between animate-fade-up in-view">
        <div className="relative pl-6">
          <div className="absolute left-0 top-0 h-full w-[1px] bg-gradient-to-b from-[#b79262] via-[#b79262]/20 to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 font-sans">
            Internal Access System
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.1] text-gold-gradient md:text-5xl">
            Society <br className="md:hidden" /> Administration
          </h1>
          <div className="mt-4 flex items-center gap-2">
            <span className="h-1 w-1 bg-[#b79262]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-600 font-sans">
              Session Profile: {auth.user.email}
            </p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="group relative flex min-h-11 items-center bg-white/[0.03] border border-white/[0.08] px-6 transition-all duration-300 hover:border-[#b79262]/30"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 group-hover:text-neutral-200 font-sans">
            Sign out
          </span>
        </button>
      </section>

      {/* Tabs / Navigation */}
      <div className="mb-10 flex flex-wrap gap-1 border-b border-white/[0.05] pb-px">
        <NavButton
          label="Player Roster"
          active={screen === "roster"}
          onClick={() => {
            setScreen("roster");
            setSelectedMatchId(null);
          }}
        />
        <NavButton
          label="Tournament Library"
          active={screen === "tournaments" || screen === "tournament" || screen === "match"}
          onClick={() => setScreen("tournaments")}
        />
        <NavButton
          label="Lichess Sync"
          active={screen === "lichess-sync"}
          onClick={() => setScreen("lichess-sync")}
        />
      </div>

      {mobileBackAction ? (
        <div className="mb-8 md:hidden">
          <button
            type="button"
            onClick={mobileBackAction.onClick}
            className="inline-flex min-h-12 items-center border border-white/[0.1] px-6 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 font-sans"
          >
            ← {mobileBackAction.label}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-8 relative p-4 bg-red-950/20 border border-red-900/30">
          <p className="text-sm text-red-400 font-sans">{error}</p>
        </div>
      ) : null}
      
      {message ? (
        <div className="mb-8 relative p-4 bg-gold-950/20 border border-[#b79262]/30">
          <p className="text-sm text-gold-gradient font-sans italic">{message}</p>
        </div>
      ) : null}

      <div className="animate-fade-up in-view">
        {renderScreen()}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* UI Components                                                              */
/* -------------------------------------------------------------------------- */

function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-container px-4 py-20 md:px-8 bg-[#0a0a0a] min-h-screen text-white">
      <div className="mx-auto max-w-xl">
        <section className="relative ring-1 ring-white/[0.08] bg-[#0a0a0a] p-8 md:p-12">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-transparent via-[#b79262] to-transparent opacity-50" />
          <h1 className="font-serif text-3xl text-gold-gradient text-center">{title}</h1>
          <div className="mt-8 text-sm text-neutral-400 font-sans">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 px-6 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-300 relative font-sans ${
        active 
          ? "text-[#f2ca50]" 
          : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-[#b79262] to-transparent" />
      )}
    </button>
  );
}

function MatchChip({
  match,
  players,
  onOpenMatch,
  compact
}: {
  match: Match;
  players: Player[];
  onOpenMatch: (matchId: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenMatch(match.id)}
      className={`relative group bg-[#0f0f0f] ring-1 ring-white/[0.05] text-left transition-all duration-500 hover:ring-[#b79262]/40 ${
        compact ? "min-h-10 px-4 py-2 text-xs" : "min-h-14 px-6 py-4 text-sm"
      }`}
    >
      <span className="block font-serif text-neutral-200 transition-colors group-hover:text-gold-gradient">
        {getPlayerName(players, match.player1_id)} <span className="text-neutral-600 font-sans italic mx-1 small-caps">vs</span> {getPlayerName(players, match.player2_id)}
      </span>
      <span className={`mt-1 block uppercase tracking-[0.16em] text-neutral-500 font-bold ${compact ? "text-[8px]" : "text-[10px]"}`}>
        {match.result ?? "Match Pending"}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Player Roster Screen                                                       */
/* -------------------------------------------------------------------------- */

function PlayerRosterScreen({
  players,
  tournaments,
  matches,
  onDone
}: {
  players: Player[];
  tournaments: Tournament[];
  matches: Match[];
  onDone: (message: string) => void;
}) {
  const [sortMode, setSortMode] = useState<RosterSortMode>("A-Z");

  const sortedPlayers = useMemo(() => {
    const list = [...players];
    if (sortMode === "A-Z") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "ELO high to low") {
      list.sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    } else if (sortMode === "ELO low to high") {
      list.sort((a, b) => (a.elo ?? 0) - (b.elo ?? 0));
    }
    return list;
  }, [players, sortMode]);

  return (
    <section className="space-y-12">
      <div className="grid gap-8 lg:grid-cols-2">
        <CreatePlayerForm onDone={onDone} players={players} />
        <BulkPlayerImportForm onDone={onDone} />
      </div>

      <section className="relative ring-1 ring-white/[0.05] bg-[#0f0f0f] p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h3 className="font-serif text-2xl text-neutral-200">Member Archive</h3>
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold mt-1">
              Archiving {players.length} Competitors
            </p>
          </div>
          <SelectInput
            label="Sequence"
            value={sortMode}
            onChange={(value) => setSortMode(value as RosterSortMode)}
            options={rosterSortModes.map(m => ({ value: m, label: m }))}
            className="md:w-64"
          />
        </div>

        <div className="space-y-4">
          {sortedPlayers.map((player) => (
            <PlayerEditorRow key={player.id} player={player} tournaments={tournaments} matches={matches} onDone={onDone} />
          ))}
        </div>
      </section>
    </section>
  );
}

function CreatePlayerForm({ onDone, players }: { onDone: (message: string) => void; players: Player[] }) {
  const [name, setName] = useState("");
  const [eloInput, setEloInput] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const elo = parseEloInput(eloInput);
    if (eloInput.trim() && elo === null) {
      onDone("ELO must be a whole number.");
      return;
    }
    await createPlayer({ name: name.trim(), elo });
    setName("");
    setEloInput("");
    onDone("Competitor profile archived.");
  }

  return (
    <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8 md:p-10">
      <h3 className="font-serif text-xl text-neutral-200 mb-6">New Membership</h3>
      <form onSubmit={onSubmit} className="grid gap-6">
        <TextInput label="Identity" value={name} onChange={setName} required />
        <TextInput label="Rating (ELO)" value={eloInput} onChange={setEloInput} type="number" min={0} />
        <button className="min-h-12 bg-white/[0.03] border border-white/[0.1] px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b79262] hover:bg-[#b79262]/10 transition-colors">
          Initialize Profile
        </button>
      </form>
    </section>
  );
}

function BulkPlayerImportForm({ onDone }: { onDone: (message: string) => void }) {
  const [rawLines, setRawLines] = useState("");

  return (
    <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8 md:p-10">
      <h3 className="font-serif text-xl text-neutral-200 mb-6">Mass Import</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = parseBulkPlayers(rawLines);
          if (!parsed.ok) { onDone(parsed.error); return; }
          await createPlayersBulk(parsed.players);
          setRawLines("");
          onDone(`Import successful: ${parsed.players.length} records processed.`);
        }}
      >
        <textarea
          value={rawLines}
          onChange={(event) => setRawLines(event.target.value)}
          rows={3}
          className="w-full border border-white/[0.08] bg-black/40 px-6 py-4 font-mono text-xs text-neutral-300 focus:border-[#b79262]/40 outline-none"
          placeholder={"Name, ELO"}
        />
        <button className="mt-4 min-h-12 border border-[#b79262]/20 px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 hover:text-neutral-200 transition-colors">
          Process Batch
        </button>
      </form>
    </section>
  );
}

function PlayerEditorRow({ player, tournaments, matches, onDone }: { player: Player; tournaments: Tournament[]; matches: Match[]; onDone: (message: string) => void }) {
  const [name, setName] = useState(player.name);
  const [eloInput, setEloInput] = useState(player.elo === null ? "" : String(player.elo));
  const assignedTournamentIds = tournaments.filter((tournament) => tournament.player_ids.includes(player.id)).map((tournament) => tournament.id);
  const usedInMatches = matches.some((match) => match.player1_id === player.id || match.player2_id === player.id);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const elo = parseEloInput(eloInput);
        await updatePlayer(player.id, { name: name.trim(), elo });
        onDone(`Profile synchronized: ${name.trim()}.`);
      }}
      className="grid gap-6 border-b border-white/[0.05] pb-6 lg:grid-cols-[1fr_120px_100px_100px] lg:items-end px-2"
    >
      <TextInput label="Identity" value={name} onChange={setName} required />
      <TextInput label="Rating" value={eloInput} onChange={setEloInput} type="number" min={0} />
      <button className="min-h-12 border border-[#b79262]/30 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2ca50] hover:bg-[#b79262]/5 transition-colors">
        Update
      </button>
      <button
        type="button"
        disabled={usedInMatches}
        onClick={async () => {
          await deletePlayerAndCleanup(player.id, assignedTournamentIds);
          onDone(`Record purged.`);
        }}
        className="min-h-12 border border-red-900/30 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 disabled:opacity-30 transition-all font-sans"
      >
        Purge
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Tournament Library Screen                                                  */
/* -------------------------------------------------------------------------- */

function TournamentLibraryScreen({
  tournaments,
  onDone,
  onOpenTournament
}: {
  tournaments: Tournament[];
  onDone: (message: string) => void;
  onOpenTournament: (tournamentId: string) => void;
}) {
  return (
    <section className="space-y-12">
      <div className="mx-auto max-w-2xl">
        <CreateTournamentForm onDone={onDone} />
      </div>

      <section className="relative ring-1 ring-white/[0.05] bg-[#0f0f0f] p-8 md:p-10">
        <h3 className="font-serif text-2xl text-neutral-200 mb-8">Event Archives</h3>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#b79262]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative border border-white/[0.05] bg-white/[0.01] p-8 transition-transform duration-500 group-hover:-translate-y-1">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b79262]">
                    {tournament.status}
                  </span>
                  <span className="text-[10px] font-sans text-neutral-600">
                    {tournament.date}
                  </span>
                </div>
                <h4 className="font-serif text-xl text-neutral-200 line-clamp-2 min-h-[3.5rem]">
                  {tournament.name}
                </h4>
                <div className="mt-8 flex items-center justify-between border-t border-white/[0.05] pt-6">
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-[0.1em] text-neutral-600 font-bold">System</span>
                    <span className="text-[10px] text-neutral-400 font-sans">{tournament.rounds} Rounds</span>
                  </div>
                  <button
                    onClick={() => onOpenTournament(tournament.id)}
                    className="min-h-10 border border-[#b79262]/40 px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2ca50] hover:bg-[#b79262]/10 transition-colors"
                  >
                    Manage
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function CreateTournamentForm({ onDone }: { onDone: (message: string) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [rounds, setRounds] = useState(4);
  const [status, setStatus] = useState<TournamentStatus>("upcoming");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createTournament({ name: name.trim(), date, rounds, status, source: "manual", stages: createDefaultStages(rounds) });
    setName(""); setDate(""); setRounds(4); setStatus("upcoming");
    onDone("New event record initialized.");
  }

  return (
    <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8 md:p-10">
      <h3 className="font-serif text-2xl text-neutral-200 mb-8 text-center">Initialize Event</h3>
      <form onSubmit={onSubmit} className="grid gap-6 sm:grid-cols-2">
        <TextInput label="Event Title" value={name} onChange={setName} required className="sm:col-span-2" />
        <TextInput label="Sanctioned Date" value={date} onChange={setDate} type="date" required />
        <TextInput label="Round Count" value={String(rounds)} onChange={(v) => setRounds(Number(v))} type="number" min={1} required />
        <SelectInput label="Official Status" value={status} onChange={(v) => setStatus(v as TournamentStatus)} options={statuses} className="sm:col-span-2" />
        <button className="mt-4 min-h-14 bg-gradient-to-r from-[#b79262] to-[#f2ca50] px-8 text-[11px] font-bold uppercase tracking-[0.3em] text-black hover:opacity-90 transition-all duration-300 sm:col-span-2 font-sans">
          Create Archive
        </button>
      </form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Tournament Detail Screen                                                   */
/* -------------------------------------------------------------------------- */

function TournamentDetailScreen({
  tournament,
  players,
  matches,
  onDone,
  onBack,
  onOpenMatch
}: {
  tournament: Tournament;
  players: Player[];
  matches: Match[];
  onDone: (message: string) => void;
  onBack: () => void;
  onOpenMatch: (matchId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"settings" | "roster" | "brackets">("brackets");

  return (
    <section className="space-y-10 animate-fade-up in-view">
      <div className="flex flex-wrap gap-2 border-b border-white/[0.05]">
        <NavButton label="Event Protocol" active={activeTab === "brackets"} onClick={() => setActiveTab("brackets")} />
        <NavButton label="Competitor Roster" active={activeTab === "roster"} onClick={() => setActiveTab("roster")} />
        <NavButton label="Metadata Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
      </div>

      {activeTab === "brackets" && (
        <TournamentStagesForm tournament={tournament} players={players} matches={matches} onDone={onDone} onOpenMatch={onOpenMatch} />
      )}
      {activeTab === "roster" && (
        <TournamentPlayersForm tournament={tournament} players={players} onDone={onDone} />
      )}
      {activeTab === "settings" && (
        <div className="mx-auto max-w-xl">
          <TournamentSettingsForm tournament={tournament} onDone={onDone} />
          <div className="mt-12 bg-red-950/20 border border-red-900/30 p-8">
            <h4 className="font-serif text-lg text-red-500 font-bold mb-2 uppercase tracking-wide">Danger Zone</h4>
            <p className="text-sm text-red-400/80 mb-6 font-sans">Purging this event will permanently delete all related match history and group metadata.</p>
            <button
              onClick={async () => {
                if (confirm("Permanently purge this event archive?")) {
                  await deleteTournamentWithMatches(tournament.id);
                  onBack();
                }
              }}
              className="min-h-12 border border-red-900/40 px-8 text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 hover:bg-red-500/10 transition-colors"
            >
              Purge Event Archive
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TournamentSettingsForm({ tournament, onDone }: { tournament: Tournament; onDone: (message: string) => void }) {
  const [name, setName] = useState(tournament.name);
  const [date, setDate] = useState(tournament.date);
  const [rounds, setRounds] = useState(tournament.rounds);
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);
  const [lichessId, setLichessId] = useState(tournament.lichessId || "");
  const [limit, setLimit] = useState(tournament.clock?.limit ? tournament.clock.limit / 60 : 10);
  const [increment, setIncrement] = useState(tournament.clock?.increment ?? 0);
  const [stages, setStages] = useState<TournamentStage[]>(tournament.stages);

  return (
    <section className="space-y-10">
      <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8 md:p-10">
        <h4 className="font-serif text-lg text-[#b79262] mb-8 uppercase tracking-widest">Metadata Configuration</h4>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await updateTournament(tournament.id, {
              name: name.trim(),
              date,
              rounds: Number(rounds),
              status,
              lichessId: lichessId.trim() || undefined,
              clock: { limit: limit * 60, increment },
              stages
            });
            onDone("Archive metadata synchronized.");
          }}
          className="grid gap-6"
        >
          <TextInput label="Event Name" value={name} onChange={setName} required />
          <TextInput label="Lichess Reference ID (Optional)" value={lichessId} onChange={setLichessId} placeholder="Arena ID or Swiss ID" />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextInput label="Official Date" value={date} onChange={setDate} type="date" required />
            <TextInput label="Round Count" value={String(rounds)} onChange={(v) => setRounds(Number(v))} type="number" min={1} required />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <TextInput label="Clock Mins" value={String(limit)} onChange={(v) => setLimit(Number(v))} type="number" min={0} required />
            <TextInput label="Increment Secs" value={String(increment)} onChange={(v) => setIncrement(Number(v))} type="number" min={0} required />
          </div>
          <SelectInput label="Official Status" value={status} onChange={(v) => setStatus(v as TournamentStatus)} options={statuses} />

          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Tournament Structure (Stages)</h5>
              <button
                type="button"
                onClick={() => setStages([...stages, { id: `stage-${Date.now()}`, name: "New Stage", type: "knockout", round: stages.length + 1 }])}
                className="text-[9px] font-bold uppercase tracking-widest text-[#b79262] hover:text-[#f2ca50] transition-colors"
              >
                + Add Stage
              </button>
            </div>
            <div className="space-y-4">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="bg-white/[0.02] p-4 border border-white/[0.05] space-y-4">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                    <input
                      value={stage.name}
                      onChange={(e) => {
                        const next = [...stages];
                        next[idx].name = e.target.value;
                        setStages(next);
                      }}
                      className="bg-transparent border-b border-white/10 px-2 py-1 text-sm text-neutral-300 focus:outline-none focus:border-[#b79262] font-serif"
                    />
                    <select
                      value={stage.type}
                      onChange={(e) => {
                        const next = [...stages];
                        next[idx].type = e.target.value as any;
                        if (next[idx].type === "group") next[idx].groups = ["A", "B", "C", "D"];
                        setStages(next);
                      }}
                      className="bg-zinc-900 border border-white/10 px-2 py-1 text-[10px] text-neutral-400 font-bold uppercase tracking-wider"
                    >
                      <option value="group">Group Stage</option>
                      <option value="knockout">Knockout</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setStages(stages.filter((_, i) => i !== idx))}
                      className="text-red-500/50 hover:text-red-500 p-1 text-xl"
                    >
                      ×
                    </button>
                  </div>
                  {stage.type === "group" && (
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Groups (CSV):</span>
                      <input
                        value={(stage.groups ?? []).join(", ")}
                        onChange={(e) => {
                          const next = [...stages];
                          next[idx].groups = e.target.value.split(",").map(g => g.trim()).filter(Boolean);
                          setStages(next);
                        }}
                        className="bg-transparent border-b border-white/10 px-2 py-1 text-[10px] text-neutral-400 font-bold focus:outline-none focus:border-[#b79262] flex-1"
                        placeholder="A, B, C, D"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button className="mt-4 min-h-14 bg-white/[0.03] border border-white/[0.1] px-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b79262] hover:bg-[#b79262]/10 transition-colors">
            Commit Changes
          </button>
        </form>
      </section>
    </section>
  );
}

function TournamentPlayersForm({
  tournament,
  players,
  onDone
}: {
  tournament: Tournament;
  players: Player[];
  onDone: (message: string) => void;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const assignedPlayers = players.filter((p) => tournament.player_ids.includes(p.id));
  const availablePlayers = players.filter((p) => !tournament.player_ids.includes(p.id));
  const groups = useMemo(() => {
    const allGroups = new Set<string>();
    tournament.stages.forEach(stage => {
      if (stage.type === "group" && stage.groups) {
        stage.groups.forEach(g => allGroups.add(g));
      }
    });
    return Array.from(allGroups).sort();
  }, [tournament.stages]);


  return (
    <section className="grid gap-12 lg:grid-cols-[1fr_320px]">
      <section className="relative ring-1 ring-white/[0.05] bg-[#0f0f0f] p-8 md:p-10">
        <h3 className="font-serif text-2xl text-neutral-200 mb-8">Registered Competitors</h3>
        <div className="space-y-4">
          {assignedPlayers.map((player) => (
            <div key={player.id} className="group flex flex-col sm:flex-row sm:items-center justify-between border border-white/[0.05] bg-white/[0.01] px-6 py-4 transition-colors hover:bg-white/[0.03] gap-4">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-[#b79262] font-mono w-10 opacity-60">
                  {player.elo ?? "---"}
                </span>
                <span className="text-sm text-neutral-200 font-serif">{player.name}</span>
              </div>
              
              <div className="flex items-center gap-4 ml-auto sm:ml-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Grp</span>
                  <select
                    value={tournament.group_assignments[player.id] || ""}
                    onChange={async (e) => {
                      const code = e.target.value || null;
                      await setTournamentPlayerGroup(tournament.id, player.id, code);
                      onDone(`Reassigned ${player.name} to Group ${code || "Unassigned"}.`);
                    }}
                    className="bg-zinc-900 border border-white/10 px-2 py-1 text-[10px] text-[#f2ca50] font-bold uppercase"
                  >
                    <option value="">None</option>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                
                <button
                  onClick={async () => {
                    await removePlayerFromTournament(tournament.id, player.id);
                    onDone(`Removed ${player.name} from event.`);
                  }}
                  className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-colors px-2 border-l border-white/10 ml-2"
                >
                  Release
                </button>
              </div>
            </div>
          ))}
          {assignedPlayers.length === 0 && <p className="text-sm italic text-neutral-600 text-center py-12">No personnel assigned to this operation.</p>}
        </div>
      </section>

      <section className="relative ring-1 ring-white/[0.08] bg-[#0b0b0b] p-8">
        <h4 className="font-serif text-lg text-neutral-200 mb-6">Assign Member</h4>
        <div className="space-y-4">
          <SelectInput
            label="Registry Search"
            value={selectedPlayerId}
            onChange={setSelectedPlayerId}
            options={availablePlayers.map((p) => ({ value: p.id, label: `${p.name} (${p.elo ?? "No ELO"})` }))}
          />
          <button
            disabled={!selectedPlayerId}
            onClick={async () => {
              await addPlayerToTournament(tournament.id, selectedPlayerId);
              const name = players.find(p => p.id === selectedPlayerId)?.name;
              setSelectedPlayerId("");
              onDone(`Competitor ${name} assigned.`);
            }}
            className="w-full min-h-12 bg-[#b79262]/20 border border-[#b79262]/30 text-[#f2ca50] text-[10px] font-bold uppercase tracking-[0.2em] disabled:opacity-20 transition-all hover:bg-[#b79262]/40"
          >
            Authorize Assignment
          </button>
        </div>
      </section>
    </section>
  );
}

function TournamentStagesForm({
  tournament,
  players,
  matches,
  onDone,
  onOpenMatch
}: {
  tournament: Tournament;
  players: Player[];
  matches: Match[];
  onDone: (message: string) => void;
  onOpenMatch: (matchId: string) => void;
}) {
  const [selectedStageId, setSelectedStageId] = useState(tournament.stages[0]?.id ?? "");
  const activeStage = tournament.stages.find((s) => s.id === selectedStageId) ?? tournament.stages[0];

  if (!activeStage) return null;

  const stageMatches = matches.filter((m) => m.stage_id === activeStage.id);

  return (
    <section className="space-y-10 animate-fade-up in-view">
      <div className="flex flex-col gap-6 md:flex-row md:items-end justify-between">
        <div className="flex flex-wrap gap-2">
          {tournament.stages.map((stage) => (
            <button
              key={stage.id}
              onClick={() => setSelectedStageId(stage.id)}
              className={`min-h-10 px-6 text-[9px] font-bold uppercase tracking-[0.2em] transition-all border ${
                selectedStageId === stage.id ? "bg-[#b79262] text-black border-transparent" : "border-white/[0.08] text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {stage.name}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            const firstGroup = activeStage.type === "group" ? (activeStage.groups?.[0] ?? "A") : null;
            const id = await createMatch({
              tournament_id: tournament.id,
              stage_id: activeStage.id,
              round: activeStage.round,
              group_id: firstGroup,
              player1_id: "",
              player2_id: ""
            });
            onOpenMatch(id);
          }}
          className="min-h-11 border border-[#b79262] px-6 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50] shadow-[0_0_20px_rgba(183,146,98,0.1)] hover:bg-[#b79262]/5"
        >
          Initialize Match
        </button>
      </div>

      <div className="ring-1 ring-white/[0.05] bg-[#0f0f0f] p-8 md:p-10">
        <div className="flex flex-col gap-8">
          {activeStage.type === "group" ? (
            (activeStage.groups ?? ["A"]).map((group) => (
              <div key={group} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                  <h4 className="font-serif text-lg text-[#b79262]">Group {group}</h4>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stageMatches
                    .filter((m) => m.group_id === group)
                    .map((match) => (
                      <MatchChip key={match.id} match={match} players={players} onOpenMatch={onOpenMatch} />
                    ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stageMatches.map((match) => (
                <MatchChip key={match.id} match={match} players={players} onOpenMatch={onOpenMatch} />
              ))}
            </div>
          )}
          {stageMatches.length === 0 && (
            <p className="py-20 text-center text-sm italic text-neutral-600 font-sans">No matches scheduled in this sector.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Match Detail Screen                                                        */
/* -------------------------------------------------------------------------- */

function MatchDetailScreen({
  match,
  tournament,
  players,
  onDone,
  onBack,
  onDelete
}: {
  match: Match;
  tournament: Tournament;
  players: Player[];
  onDone: (message: string) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [player1Id, setPlayer1Id] = useState(match.player1_id);
  const [player2Id, setPlayer2Id] = useState(match.player2_id);
  const [stageId, setStageId] = useState(match.stage_id);
  const [groupId, setGroupId] = useState(match.group_id ?? "");
  const [result, setResult] = useState<MatchResult>(match.result);
  const [pgn, setPgn] = useState(match.pgn ?? "");

  const stage = tournament.stages.find((s) => s.id === stageId) || tournament.stages[0];
  const eligiblePlayers = players.filter(p => tournament.player_ids.includes(p.id));

  return (
    <section className="mx-auto max-w-2xl ring-1 ring-white/[0.08] bg-[#0b0b0b] p-8 md:p-12 animate-fade-up in-view">
      <div className="mb-10 text-center">
        <h2 className="font-serif text-3xl text-neutral-200">Encounter Analysis</h2>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#b79262] font-bold mt-2">Adjusting Match Record</p>
      </div>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await updateMatch(match.id, {
            round: stage.round,
            stage_id: stageId,
            group_id: stage.type === "group" ? groupId : null,
            player1_id: player1Id,
            player2_id: player2Id,
            result,
            pgn
          });
          onDone("Encounter records synchronized.");
          onBack();
        }}
        className="grid gap-8"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectInput label="Encounter Phase" value={stageId} onChange={v => { setStageId(v); setGroupId(""); }} options={tournament.stages.map(s => ({ value: s.id, label: s.name }))} />
          {stage.type === "group" && (
            <SelectInput label="Sector (Group)" value={groupId} onChange={setGroupId} options={(stage.groups ?? ["A"]).map(g => ({ value: g, label: `Sector ${g}` }))} />
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <SelectInput label="Commander (White)" value={player1Id} onChange={setPlayer1Id} options={eligiblePlayers.map(p => ({ value: p.id, label: p.name }))} />
          <SelectInput label="Commander (Black)" value={player2Id} onChange={setPlayer2Id} options={eligiblePlayers.map(p => ({ value: p.id, label: p.name }))} />
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Engagement Result</p>
          <div className="flex flex-wrap gap-2">
            {results.map((opt) => (
              <button
                key={opt.value ?? "clear"}
                type="button"
                onClick={() => setResult(opt.value)}
                className={`min-h-12 min-w-[120px] border px-4 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  result === opt.value ? "bg-[#b79262] border-transparent text-black" : "border-white/[0.08] text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Tactical Log (PGN)</p>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            rows={8}
            className="w-full border border-white/[0.08] bg-black/40 px-6 py-4 font-mono text-xs text-neutral-300 focus:border-[#b79262]/40 outline-none"
            placeholder={'[Event "Chess Society Round 1"]'}
          />
        </label>

        <div className="flex flex-col gap-4 pt-6">
          <button className="min-h-14 bg-gradient-to-r from-[#b79262] to-[#f2ca50] px-8 text-[11px] font-bold uppercase tracking-[0.3em] text-black shadow-[0_10px_30px_rgba(183,146,98,0.15)] hover:shadow-[0_15px_40px_rgba(183,146,98,0.25)] transition-all">
            Commit Records
          </button>
          <button
            type="button"
            onClick={async () => {
              if (confirm("Permanently purge this match record?")) {
                await deleteMatch(match.id);
                onDelete();
              }
            }}
            className="min-h-12 border border-red-900/30 text-red-500 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-red-500/5"
          >
            Purge Analysis
          </button>
        </div>
      </form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Lichess Sync Screen                                                        */
/* -------------------------------------------------------------------------- */

type SyncStatus = "idle" | "loading" | "saving" | "syncing" | "done" | "error";
type SyncResult = { tournamentsProcessed: number; gamesProcessed: number; errors: string[]; tournamentIds: string[] };

function LichessSyncScreen({ onDone }: { onDone: (message: string) => void }) {
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tournamentIds, setTournamentIds] = useState<string[]>([]);
  const [creatorUsernames, setCreatorUsernames] = useState<string[]>([]);
  const [newTournamentId, setNewTournamentId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const auth = useAuthUser();

  async function getIdToken() {
    const user = auth.user; if (!user) throw new Error("Session expired.");
    const { getIdToken: getToken } = await import("firebase/auth");
    return getToken(user, true);
  }

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      try {
        setStatus("loading");
        const token = await getIdToken();
        const res = await fetch("/api/admin/lichess-registry", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setTournamentIds(data.tournamentIds ?? []);
        setCreatorUsernames(data.creatorUsernames ?? []);
        setStatus("idle");
      } catch (e) { setErrorMsg("Failed to synchronize registry."); setStatus("error"); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  async function saveRegistry() {
    setStatus("saving");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/lichess-registry", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentIds, creatorUsernames })
      });
      const data = await res.json();
      setStatus("idle");
      if (data.syncResult) {
        setSyncResult(data.syncResult);
        onDone(`Registry updated. Processed ${data.syncResult.tournamentsProcessed} tournaments and ${data.syncResult.gamesProcessed} games.`);
      } else {
        onDone("Registry synchronization confirmed.");
      }
    } catch (e) { setErrorMsg("Sync Failed"); setStatus("error"); }
  }

  return (
    <section className="space-y-12">
      <section className="relative ring-1 ring-white/[0.05] bg-[#0f0f0f] p-8 md:p-10">
        <h2 className="font-serif text-3xl text-neutral-200">Network Uplink</h2>
        <p className="mt-4 text-sm text-neutral-400 font-sans max-w-2xl leading-relaxed">
          Configure the society&apos;s bridge to Lichess. All tournaments created by authorized commanders will be automatically mirrored into the society archives.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8">
          <h4 className="font-serif text-lg text-neutral-200 mb-6">Commander Uplink</h4>
          <div className="flex gap-4">
            <TextInput label="Lichess Member" value={newUsername} onChange={setNewUsername} placeholder="endgamesociety" className="flex-1" />
            <button onClick={() => { if (newUsername && !creatorUsernames.includes(newUsername)) setCreatorUsernames([...creatorUsernames, newUsername.toLowerCase()]); setNewUsername(""); }} className="mt-8 min-h-12 border border-[#b79262]/30 px-6 text-[10px] font-bold uppercase tracking-widest text-[#f2ca50]">Add</button>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {creatorUsernames.map(u => (
              <div key={u} className="bg-white/[0.03] border border-white/[0.08] px-4 py-2 flex items-center gap-3">
                <span className="text-[11px] font-mono text-neutral-400">@{u}</span>
                <button onClick={() => setCreatorUsernames(creatorUsernames.filter(x => x !== u))} className="text-red-500/60 hover:text-red-500 transition-colors">✕</button>
              </div>
            ))}
          </div>
        </section>

        <section className="relative ring-1 ring-white/[0.05] bg-[#0b0b0b] p-8">
          <h4 className="font-serif text-lg text-neutral-200 mb-6">Direct ID Seeds</h4>
          <div className="flex gap-4">
            <TextInput label="Tournament ID" value={newTournamentId} onChange={setNewTournamentId} placeholder="ABC123XYZ" className="flex-1" />
            <button onClick={() => { if (newTournamentId && !tournamentIds.includes(newTournamentId)) setTournamentIds([...tournamentIds, newTournamentId]); setNewTournamentId(""); }} className="mt-8 min-h-12 border border-[#b79262]/30 px-6 text-[10px] font-bold uppercase tracking-widest text-[#f2ca50]">Seed</button>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {tournamentIds.map(id => (
              <div key={id} className="bg-white/[0.03] border border-white/[0.08] px-4 py-2 flex items-center gap-3">
                <span className="text-[11px] font-mono text-neutral-400">{id}</span>
                <button onClick={() => setTournamentIds(tournamentIds.filter(x => x !== id))} className="text-red-500/60 hover:text-red-500 transition-colors">✕</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-center">
        <button
          onClick={saveRegistry}
          disabled={status === "saving"}
          className="min-h-14 bg-gradient-to-r from-[#b79262] to-[#f2ca50] px-12 text-[11px] font-bold uppercase tracking-[0.4em] text-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-[0_20px_50px_rgba(183,146,98,0.2)] font-sans"
        >
          {status === "saving" ? "Synchronizing..." : "Initialize Network Sync"}
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Primitive UI Units                                                         */
/* -------------------------------------------------------------------------- */

function TextInput({ label, value, onChange, className = "", type = "text", required, min, placeholder }: { label: string; value: string; onChange: (v: string) => void; className?: string; type?: string; required?: boolean; min?: number; placeholder?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-550 mb-3 ml-1">{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        type={type} min={min} required={required} placeholder={placeholder}
        className="w-full border border-white/[0.08] bg-white/[0.02] px-6 py-4 text-sm text-neutral-200 outline-none transition-all focus:border-[#b79262]/40 focus:bg-white/[0.04] font-sans"
      />
    </label>
  );
}


function SelectInput({ label, value, onChange, options, required, className = "" }: { label: string; value: string; onChange: (v: string) => void | Promise<void>; options: Array<{ value: string; label: string }>; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-550 mb-3 ml-1">{label}</span>
      <select
        value={value} onChange={(e) => void onChange(e.target.value)} required={required}
        className="w-full border border-white/[0.08] bg-white/[0.02] px-6 py-4 text-sm text-neutral-200 outline-none transition-all focus:border-[#b79262]/40 appearance-none font-sans"
      >
        <option value="" className="bg-[#0f0f0f]">Select Protocol</option>
        {options.map((opt) => (<option key={opt.value} value={opt.value} className="bg-[#0f0f0f]">{opt.label}</option>))}
      </select>
    </label>
  );
}

function StaticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="block">
      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-550 mb-3 ml-1">{label}</span>
      <div className="min-h-12 flex items-center px-6 border border-white/[0.05] bg-white/[0.01] text-xs text-neutral-400 font-sans">{value}</div>
    </div>
  );
}

function EmptyAdminState({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel: string; onAction: () => void }) {
  return (
    <section className="relative ring-1 ring-white/[0.05] bg-[#0f0f0f] p-12 text-center max-w-xl mx-auto">
      <h2 className="font-serif text-2xl text-neutral-200 mb-4">{title}</h2>
      <p className="text-sm text-neutral-500 font-sans leading-relaxed mb-8">{detail}</p>
      <button onClick={onAction} className="min-h-12 border border-[#b79262]/40 px-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2ca50] hover:bg-[#b79262]/5 transition-all">
        {actionLabel}
      </button>
    </section>
  );
}

function parseEloInput(v: string) {
  const t = v.trim(); if (!t) return null;
  const e = Number(t); return Number.isInteger(e) && e >= 0 ? e : null;
}

function parseBulkPlayers(rawLines: string): { ok: true; players: Array<{ name: string; elo: number | null }> } | { ok: false; error: string } {
  const players: Array<{ name: string; elo: number | null }> = [];
  const lines = rawLines.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]?.trim(); if (!l) continue;
    const [namePart, eloPart, extra] = l.split(",").map(p => p.trim());
    if (!namePart) return { ok: false, error: `Row ${i + 1} invalid identity.` };
    if (extra !== undefined) return { ok: false, error: `Row ${i + 1} data overflow.` };
    const elo = eloPart ? parseEloInput(eloPart) : null;
    players.push({ name: namePart, elo });
  }
  return { ok: true, players };
}

function syncStagesToRoundCount(stages: TournamentStage[], rounds: number) {
  const safeRounds = Math.max(1, rounds);
  const groupStage = stages.find((s) => s.type === "group") ?? { id: "groups", name: "Sector Phase", type: "group", round: 1, groups: ["A", "B", "C", "D"] };
  const knockoutStages = stages.filter((s) => s.type === "knockout");
  const nextStages: TournamentStage[] = [{ ...groupStage, round: 1 }];
  for (let i = 0; i < safeRounds - 1; i++) {
    const existing = knockoutStages[i];
    nextStages.push(existing ? { ...existing, round: i + 2 } : { id: `ko-${i+2}`, name: `Knockout ${i + 1}`, type: "knockout", round: i + 2 });
  }
  return nextStages;
}
