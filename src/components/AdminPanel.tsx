"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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
  getGroupStage,
  getPlayerName,
  getTournamentPlayersByGroup,
  slugifyStageName
} from "@/lib/standings";
import type {
  Match,
  MatchResult,
  Player,
  Tournament,
  TournamentStage,
  TournamentStageType,
  TournamentStatus
} from "@/lib/types";

const statuses: TournamentStatus[] = ["upcoming", "ongoing", "completed"];
const results: MatchResult[] = ["1-0", "0-1", "1/2-1/2", null];
const rosterSortModes = ["A-Z", "ELO high to low", "ELO low to high"] as const;

type RosterSortMode = (typeof rosterSortModes)[number];
type AdminScreen = "roster" | "tournaments" | "tournament" | "match";

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
    return <AdminShell title="Checking access">Loading admin session...</AdminShell>;
  }

  if (!auth.user) {
    return (
      <AdminShell title="Admin access required">
        <p className="text-on-surface-variant">Sign in before editing tournament data.</p>
        <Link href="/login" className="mt-4 inline-flex min-h-12 items-center bg-primary px-5 text-xs font-bold uppercase tracking-[0.2em] text-on-primary">
          Login
        </Link>
      </AdminShell>
    );
  }

  if (!auth.isAdmin) {
    return (
      <AdminShell title="Access denied">
        <p className="text-on-surface-variant">{auth.user.email} is authenticated but not included in the admin email whitelist.</p>
        <button onClick={() => logout()} className="mt-4 border border-outline-variant px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]">
          Sign out
        </button>
      </AdminShell>
    );
  }

  const error = tournaments.error || players.error || matches.error;
  const selectedTournament = tournaments.data.find((item) => item.id === selectedTournamentId) ?? null;
  const selectedMatch = matches.data.find((item) => item.id === selectedMatchId) ?? null;
  const tournamentForMatch = selectedTournament ?? tournaments.data.find((item) => item.id === selectedMatch?.tournament_id) ?? null;

  const renderScreen = () => {
    if (screen === "roster") {
      return <PlayerRosterScreen players={players.data} tournaments={tournaments.data} matches={matches.data} onDone={setMessage} />;
    }

    if (screen === "tournaments") {
      return (
        <TournamentLibraryScreen
          tournaments={tournaments.data}
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
            title="Tournament not found"
            detail="Choose a tournament from the library to manage its groups, roster, and matches."
            actionLabel="Back to tournament library"
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
          title="Match not found"
          detail="Select a match from a tournament to edit it or open the PGN viewer."
          actionLabel="Back to tournament"
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
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-12">
      <section className="mb-8 flex flex-col gap-4 border-l-2 border-primary pl-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Remote Firestore Control</p>
          <h1 className="mt-2 font-serif text-4xl text-primary">Society Administration</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Signed in as {auth.user.email}</p>
        </div>
        <button onClick={() => logout()} className="min-h-11 border border-outline-variant px-5 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">
          Sign out
        </button>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
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
      </div>

      {error ? <p className="mb-6 border border-error-container bg-error-container/20 p-3 text-sm text-error">{error}</p> : null}
      {message ? <p className="mb-6 border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p> : null}

      {renderScreen()}
    </main>
  );
}

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
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<RosterSortMode>("A-Z");

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextPlayers = players.filter((player) => player.name.toLowerCase().includes(normalizedQuery));

    nextPlayers.sort((a, b) => {
      if (sortMode === "A-Z") {
        return a.name.localeCompare(b.name);
      }

      const aElo = a.elo;
      const bElo = b.elo;

      if (aElo === null && bElo === null) {
        return a.name.localeCompare(b.name);
      }

      if (aElo === null) {
        return 1;
      }

      if (bElo === null) {
        return -1;
      }

      return sortMode === "ELO high to low" ? bElo - aElo : aElo - bElo;
    });

    return nextPlayers;
  }, [players, query, sortMode]);

  return (
    <section className="space-y-6">
      <section className="border border-neutral-800 bg-surface-container p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">Admin Home</p>
        <h2 className="mt-2 font-serif text-3xl text-on-surface">Player Roster</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Search, sort, and maintain the master player library. ELO is stored in `players.elo` as a numeric field.</p>
      </section>

      <CreatePlayerForm onDone={onDone} players={players} />
      <BulkPlayerImportForm onDone={onDone} />

      <section className="border border-neutral-800 bg-surface-container p-5">
        <div className="flex flex-col gap-4 border-b border-neutral-800 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="font-serif text-2xl text-on-surface">All Players</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{filteredPlayers.length} shown / {players.length} total</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[260px_220px]">
            <TextInput label="Search player" value={query} onChange={setQuery} placeholder="Type a player name" />
            <SelectInput label="Sort" value={sortMode} onChange={(value) => setSortMode(value as RosterSortMode)} options={rosterSortModes as unknown as string[]} />
          </div>
        </div>
        {filteredPlayers.length === 0 ? (
          <p className="pt-5 text-sm text-on-surface-variant">No players match the current search or sort view.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {filteredPlayers.map((player) => (
              <PlayerEditorRow
                key={player.id}
                player={player}
                tournaments={tournaments}
                matches={matches}
                onDone={onDone}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TournamentLibraryScreen({
  tournaments,
  onDone,
  onOpenTournament
}: {
  tournaments: Tournament[];
  onDone: (message: string) => void;
  onOpenTournament: (tournamentId: string) => void;
}) {
  const grouped = useMemo(
    () =>
      statuses.map((status) => ({
        status,
        items: tournaments.filter((tournament) => tournament.status === status)
      })),
    [tournaments]
  );

  return (
    <section className="space-y-6">
      <section className="border border-neutral-800 bg-surface-container p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">Tournament Control</p>
        <h2 className="mt-2 font-serif text-3xl text-on-surface">Tournament Library</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Open a tournament to manage stages, groups, roster assignments, and match progression.</p>
      </section>

      <CreateTournamentForm onDone={onDone} />

      <section className="border border-neutral-800 bg-surface-container p-5">
        <h3 className="font-serif text-2xl text-on-surface">Edit Tournament</h3>
        <div className="mt-5 space-y-5">
          {grouped.map((group) => (
            <div key={group.status}>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">{group.status}</p>
              {group.items.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No {group.status} tournaments.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {group.items.map((tournament) => (
                    <button
                      key={tournament.id}
                      type="button"
                      onClick={() => onOpenTournament(tournament.id)}
                      className="min-h-11 border border-outline-variant bg-surface-container-low px-4 py-3 text-left text-sm text-on-surface transition hover:border-primary hover:text-primary"
                    >
                      <span className="block font-semibold">{tournament.name}</span>
                      <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-on-surface-variant">
                        {tournament.date || "Unscheduled"} - {tournament.rounds} rounds
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

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
  const rosterPlayers = players.filter((player) => tournament.player_ids.includes(player.id));
  const unassignedPlayers = players.filter((player) => !tournament.player_ids.includes(player.id));
  const groupedRoster = getTournamentPlayersByGroup(tournament, players);
  const stageMatches = tournament.stages.map((stage) => ({
    stage,
    matches: matches.filter((match) => match.stage_id === stage.id)
  }));

  return (
    <section className="space-y-6">
      <section className="border border-neutral-800 bg-surface-container p-5">
        <button type="button" onClick={onBack} className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">
          Back to tournament library
        </button>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">{tournament.status}</p>
            <h2 className="mt-2 font-serif text-3xl text-on-surface">{tournament.name}</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {tournament.date || "Unscheduled"} - {tournament.rounds} rounds - {rosterPlayers.length} rostered players
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/tournaments/${encodeURIComponent(tournament.id)}`} className="inline-flex min-h-11 items-center border border-outline-variant px-4 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              Open public dashboard
            </Link>
            <button
              type="button"
              onClick={async () => {
                await deleteTournamentWithMatches(
                  tournament.id,
                  matches.map((match) => match.id)
                );
                onDone(`Deleted ${tournament.name} and ${matches.length} linked matches.`);
                onBack();
              }}
              className="min-h-11 border border-error px-4 text-xs font-bold uppercase tracking-[0.16em] text-error"
            >
              Delete tournament
            </button>
          </div>
        </div>
      </section>

      <TournamentSettingsForm tournament={tournament} onDone={onDone} />
      <TournamentStagesForm tournament={tournament} onDone={onDone} />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TournamentRosterSection
          tournament={tournament}
          rosterPlayers={rosterPlayers}
          groupedRoster={groupedRoster}
          availablePlayers={unassignedPlayers}
          onDone={onDone}
        />
        <CreateTournamentMatchForm tournament={tournament} rosterPlayers={rosterPlayers} onDone={onDone} />
      </section>

      <section className="border border-neutral-800 bg-surface-container p-5">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <h3 className="font-serif text-2xl text-on-surface">Matches</h3>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{matches.length} total</p>
        </div>
        {matches.length === 0 ? (
          <p className="pt-5 text-sm text-on-surface-variant">No matches created yet. Define groups, assign players, then create fixtures by stage.</p>
        ) : (
          <div className="mt-5 space-y-5">
            {stageMatches.map(({ stage, matches: stageItems }) => (
              <div key={stage.id}>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">{stage.name}</p>
                {stage.type === "group" ? (
                  <div className="space-y-4">
                    {(stage.groups ?? []).map((groupCode) => {
                      const groupMatches = stageItems.filter((match) => match.group_id === groupCode);

                      return (
                        <div key={groupCode}>
                          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Group {groupCode}</p>
                          {groupMatches.length === 0 ? (
                            <p className="text-sm text-on-surface-variant">No matches yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {groupMatches.map((match) => (
                                <MatchChip key={match.id} match={match} players={players} onOpenMatch={onOpenMatch} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : stageItems.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No matches yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {stageItems.map((match) => (
                      <MatchChip key={match.id} match={match} players={players} onOpenMatch={onOpenMatch} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

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
  const eligiblePlayers = players.filter(
    (player) => tournament.player_ids.includes(player.id) || player.id === match.player1_id || player.id === match.player2_id
  );

  return (
    <section className="space-y-6">
      <section className="border border-neutral-800 bg-surface-container p-5">
        <button type="button" onClick={onBack} className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">
          Back to tournament
        </button>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">{tournament.name}</p>
            <h2 className="mt-2 font-serif text-3xl text-on-surface">
              {getPlayerName(players, match.player1_id)} vs {getPlayerName(players, match.player2_id)}
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {getStageName(tournament, match.stage_id)}{match.group_id ? ` - Group ${match.group_id}` : ""} - {match.result ?? "Pending result"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/match/${match.id}`} className="inline-flex min-h-11 items-center border border-primary px-4 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              View Match
            </Link>
            <button
              type="button"
              onClick={async () => {
                await deleteMatch(match.id);
                onDone("Match deleted.");
                onDelete();
              }}
              className="min-h-11 border border-error px-4 text-xs font-bold uppercase tracking-[0.16em] text-error"
            >
              Delete match
            </button>
          </div>
        </div>
      </section>

      <MatchEditorCard match={match} tournament={tournament} players={eligiblePlayers} onDone={onDone} />
    </section>
  );
}

function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8">
      <section className="border border-neutral-800 bg-surface-container-low p-6">
        <h1 className="font-serif text-3xl text-primary">{title}</h1>
        <div className="mt-3 text-sm">{children}</div>
      </section>
    </main>
  );
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 border px-4 text-xs font-bold uppercase tracking-[0.16em] ${
        active ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"
      }`}
    >
      {label}
    </button>
  );
}

function MatchChip({
  match,
  players,
  onOpenMatch
}: {
  match: Match;
  players: Player[];
  onOpenMatch: (matchId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenMatch(match.id)}
      className="min-h-11 border border-outline-variant bg-surface-container-low px-4 py-3 text-left text-sm transition hover:border-primary hover:text-primary"
    >
      <span className="block font-semibold">
        {getPlayerName(players, match.player1_id)} vs {getPlayerName(players, match.player2_id)}
      </span>
      <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-on-surface-variant">{match.result ?? "Pending"}</span>
    </button>
  );
}

function CreateTournamentForm({ onDone }: { onDone: (message: string) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [rounds, setRounds] = useState(4);
  const [status, setStatus] = useState<TournamentStatus>("upcoming");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createTournament({ name: name.trim(), date, rounds, status });
    setName("");
    setDate("");
    setRounds(4);
    setStatus("upcoming");
    onDone("Tournament created.");
  }

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <h3 className="font-serif text-2xl text-on-surface">Create Tournament</h3>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextInput label="Name" value={name} onChange={setName} required className="sm:col-span-2" />
        <TextInput label="Date" value={date} onChange={setDate} type="date" required />
        <TextInput label="Rounds" value={String(rounds)} onChange={(value) => setRounds(Number(value))} type="number" min={1} required />
        <SelectInput label="Status" value={status} onChange={(value) => setStatus(value as TournamentStatus)} options={statuses} className="sm:col-span-2" />
        <button className="min-h-12 bg-primary px-5 text-xs font-bold uppercase tracking-[0.2em] text-on-primary sm:col-span-2">
          Create tournament
        </button>
      </form>
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
    onDone("Player added.");
  }

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-2xl text-on-surface">Add Player</h3>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{players.length} in library</p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <TextInput label="Name" value={name} onChange={setName} required />
        <TextInput label="ELO" value={eloInput} onChange={setEloInput} type="number" min={0} />
        <button className="min-h-12 bg-secondary-container px-4 text-xs font-bold uppercase tracking-[0.16em] text-on-secondary-container sm:self-end">
          Add
        </button>
      </form>
    </section>
  );
}

function BulkPlayerImportForm({ onDone }: { onDone: (message: string) => void }) {
  const [rawLines, setRawLines] = useState("");

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <h3 className="font-serif text-2xl text-on-surface">Bulk Player Import</h3>
      <p className="mt-2 text-sm text-on-surface-variant">Enter one player per line as `Name` or `Name, ELO`.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = parseBulkPlayers(rawLines);

          if (!parsed.ok) {
            onDone(parsed.error);
            return;
          }

          if (parsed.players.length === 0) {
            onDone("No valid player rows found.");
            return;
          }

          await createPlayersBulk(parsed.players);
          setRawLines("");
          onDone(`Imported ${parsed.players.length} players.`);
        }}
        className="mt-4"
      >
        <textarea
          value={rawLines}
          onChange={(event) => setRawLines(event.target.value)}
          rows={6}
          className="w-full border border-outline-variant bg-surface-dim px-3 py-3 font-mono text-xs text-on-surface outline-none focus:border-primary"
          placeholder={"Ali Khan, 1820\nSara Noor, 1695\nTaha Anwar"}
        />
        <button className="mt-3 min-h-11 border border-primary px-4 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Import players
        </button>
      </form>
    </section>
  );
}

function PlayerEditorRow({
  player,
  tournaments,
  matches,
  onDone
}: {
  player: Player;
  tournaments: Tournament[];
  matches: Match[];
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState(player.name);
  const [eloInput, setEloInput] = useState(player.elo === null ? "" : String(player.elo));
  const assignedTournamentIds = tournaments.filter((tournament) => tournament.player_ids.includes(player.id)).map((tournament) => tournament.id);
  const usedInMatches = matches.some((match) => match.player1_id === player.id || match.player2_id === player.id);
  const tournamentCount = assignedTournamentIds.length;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const elo = parseEloInput(eloInput);

        if (eloInput.trim() && elo === null) {
          onDone("ELO must be a whole number.");
          return;
        }

        await updatePlayer(player.id, { name: name.trim(), elo });
        onDone(`Updated ${name.trim()}.`);
      }}
      className="grid gap-3 border border-neutral-800 bg-surface-container-low p-4 lg:grid-cols-[minmax(0,1fr)_160px_130px_auto_auto]"
    >
      <TextInput label="Player" value={name} onChange={setName} required />
      <TextInput label="ELO" value={eloInput} onChange={setEloInput} type="number" min={0} />
      <StaticMetric label="Tournaments" value={String(tournamentCount)} />
      <button className="min-h-12 border border-outline-variant px-4 text-xs font-bold uppercase tracking-[0.16em] lg:self-end">Save</button>
      <button
        type="button"
        disabled={usedInMatches}
        onClick={async () => {
          await deletePlayerAndCleanup(player.id, assignedTournamentIds);
          onDone(`Deleted ${player.name}.`);
        }}
        className="min-h-12 border border-error px-4 text-xs font-bold uppercase tracking-[0.16em] text-error disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
      >
        Delete
      </button>
      {usedInMatches ? <p className="text-xs text-on-surface-variant lg:col-span-5">This player is locked because they are referenced by an existing match.</p> : null}
    </form>
  );
}

function TournamentSettingsForm({ tournament, onDone }: { tournament: Tournament; onDone: (message: string) => void }) {
  const [name, setName] = useState(tournament.name);
  const [date, setDate] = useState(tournament.date);
  const [rounds, setRounds] = useState(tournament.rounds);
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <h3 className="font-serif text-2xl text-on-surface">Tournament Settings</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await updateTournament(tournament.id, {
            name: name.trim(),
            date,
            rounds,
            status,
            stages: syncStagesToRoundCount(tournament.stages, rounds)
          });
          onDone("Tournament updated.");
        }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <TextInput label="Name" value={name} onChange={setName} required className="sm:col-span-2" />
        <TextInput label="Date" value={date} onChange={setDate} type="date" required />
        <TextInput label="Rounds" value={String(rounds)} onChange={(value) => setRounds(Number(value))} type="number" min={1} required />
        <SelectInput label="Status" value={status} onChange={(value) => setStatus(value as TournamentStatus)} options={statuses} className="sm:col-span-2" />
        <button className="min-h-12 border border-primary px-5 text-xs font-bold uppercase tracking-[0.16em] text-primary sm:col-span-2">
          Save tournament
        </button>
      </form>
    </section>
  );
}

function TournamentStagesForm({ tournament, onDone }: { tournament: Tournament; onDone: (message: string) => void }) {
  const [groupCodesInput, setGroupCodesInput] = useState((getGroupStage(tournament)?.groups ?? []).join(", "));
  const [knockoutNames, setKnockoutNames] = useState(
    tournament.stages.filter((stage) => stage.type === "knockout").map((stage) => stage.name)
  );

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <h3 className="font-serif text-2xl text-on-surface">Tournament Structure</h3>
      <p className="mt-2 text-sm text-on-surface-variant">V1 uses a single opening group stage, followed by knockout stages. Group codes and knockout names can be edited here.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const groupCodes = parseGroupCodes(groupCodesInput);

          if (groupCodes.length === 0) {
            onDone("Enter at least one group code.");
            return;
          }

          const defaultStages = createDefaultStages(tournament.rounds);
          const nextStages = defaultStages.map((stage, index) => {
            if (stage.type === "group") {
              return { ...stage, groups: groupCodes };
            }

            return {
              ...stage,
              name: knockoutNames[index - 1]?.trim() || stage.name
            };
          });

          await updateTournament(tournament.id, { stages: nextStages });
          onDone("Tournament stages updated.");
        }}
        className="mt-5 space-y-4"
      >
        <TextInput label="Group codes" value={groupCodesInput} onChange={setGroupCodesInput} placeholder="A, B, C, D" />
        <div className="grid gap-4 sm:grid-cols-2">
          {tournament.stages
            .filter((stage) => stage.type === "knockout")
            .map((stage, index) => (
              <TextInput
                key={stage.id}
                label={`Knockout stage ${index + 1}`}
                value={knockoutNames[index] ?? ""}
                onChange={(value) => {
                  const next = [...knockoutNames];
                  next[index] = value;
                  setKnockoutNames(next);
                }}
              />
            ))}
        </div>
        <button className="min-h-12 border border-primary px-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Save structure
        </button>
      </form>
    </section>
  );
}

function TournamentRosterSection({
  tournament,
  rosterPlayers,
  groupedRoster,
  availablePlayers,
  onDone
}: {
  tournament: Tournament;
  rosterPlayers: Player[];
  groupedRoster: ReturnType<typeof getTournamentPlayersByGroup>;
  availablePlayers: Player[];
  onDone: (message: string) => void;
}) {
  const [playerIdToAdd, setPlayerIdToAdd] = useState("");
  const groupStage = getGroupStage(tournament);
  const groupCodes = groupStage?.groups ?? [];

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <h3 className="font-serif text-2xl text-on-surface">Tournament Roster</h3>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{rosterPlayers.length} assigned</p>
      </div>

      {rosterPlayers.length === 0 ? (
        <p className="pt-5 text-sm text-on-surface-variant">No players assigned yet. Add players below before creating matches.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {groupCodes.map((groupCode) => (
            <div key={groupCode}>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">Group {groupCode}</p>
              {(groupedRoster.grouped.get(groupCode) ?? []).length === 0 ? (
                <p className="text-sm text-on-surface-variant">No players assigned.</p>
              ) : (
                <div className="space-y-3">
                  {(groupedRoster.grouped.get(groupCode) ?? []).map((player) => (
                    <PlayerGroupRow key={player.id} player={player} tournament={tournament} groupCodes={groupCodes} onDone={onDone} />
                  ))}
                </div>
              )}
            </div>
          ))}

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Unassigned</p>
            {groupedRoster.unassigned.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Every rostered player is already placed in a group.</p>
            ) : (
              <div className="space-y-3">
                {groupedRoster.unassigned.map((player) => (
                  <PlayerGroupRow key={player.id} player={player} tournament={tournament} groupCodes={groupCodes} onDone={onDone} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={async (event) => {
          event.preventDefault();

          if (!playerIdToAdd) {
            onDone("Choose a player to add.");
            return;
          }

          await addPlayerToTournament(tournament.id, playerIdToAdd);
          const playerName = getPlayerName(availablePlayers, playerIdToAdd);
          setPlayerIdToAdd("");
          onDone(`Added ${playerName} to ${tournament.name}.`);
        }}
        className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <SelectInput
          label="Add player to tournament"
          value={playerIdToAdd}
          onChange={setPlayerIdToAdd}
          options={availablePlayers.map((player) => ({
            value: player.id,
            label: `${player.name} - ${formatElo(player.elo)}`
          }))}
          className={availablePlayers.length === 0 ? "opacity-60" : ""}
        />
        <button
          disabled={availablePlayers.length === 0}
          className="min-h-12 bg-primary px-5 text-xs font-bold uppercase tracking-[0.16em] text-on-primary disabled:opacity-50 sm:self-end"
        >
          Add player
        </button>
      </form>

      {availablePlayers.length === 0 ? <p className="mt-3 text-sm text-on-surface-variant">Every player in the global roster is already assigned to this tournament.</p> : null}
    </section>
  );
}

function PlayerGroupRow({
  player,
  tournament,
  groupCodes,
  onDone
}: {
  player: Player;
  tournament: Tournament;
  groupCodes: string[];
  onDone: (message: string) => void;
}) {
  return (
    <div className="grid gap-3 border border-neutral-800 bg-surface-container-low p-4 md:grid-cols-[minmax(0,1fr)_200px_auto]">
      <div>
        <span className="block font-semibold text-on-surface">{player.name}</span>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">{formatElo(player.elo)}</span>
      </div>
      <SelectInput
        label="Group"
        value={tournament.group_assignments[player.id] ?? ""}
        onChange={async (value) => {
          await setTournamentPlayerGroup(tournament.id, player.id, value || null);
          onDone(value ? `Assigned ${player.name} to Group ${value}.` : `Cleared group for ${player.name}.`);
        }}
        options={groupCodes.map((groupCode) => ({ value: groupCode, label: `Group ${groupCode}` }))}
      />
      <button
        type="button"
        onClick={async () => {
          await removePlayerFromTournament(tournament.id, player.id);
          onDone(`Removed ${player.name} from ${tournament.name}.`);
        }}
        className="min-h-12 border border-outline-variant px-4 text-xs font-bold uppercase tracking-[0.14em] text-on-surface-variant md:self-end"
      >
        Remove
      </button>
    </div>
  );
}

function CreateTournamentMatchForm({
  tournament,
  rosterPlayers,
  onDone
}: {
  tournament: Tournament;
  rosterPlayers: Player[];
  onDone: (message: string) => void;
}) {
  const [stageId, setStageId] = useState(tournament.stages[0]?.id ?? "");
  const [groupId, setGroupId] = useState("");
  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");

  const stage = tournament.stages.find((item) => item.id === stageId) ?? tournament.stages[0] ?? null;
  const eligiblePlayers = stage?.type === "group"
    ? rosterPlayers.filter((player) => tournament.group_assignments[player.id] === groupId)
    : rosterPlayers;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rosterPlayers.length < 2) {
      onDone("Add at least two rostered players before creating a match.");
      return;
    }

    if (!stage) {
      onDone("Create tournament stages first.");
      return;
    }

    if (stage.type === "group") {
      if (!groupId) {
        onDone("Choose a group for the group-stage match.");
        return;
      }

      if (!tournament.group_assignments[player1Id] || !tournament.group_assignments[player2Id]) {
        onDone("Assign both players to a group before creating a group-stage match.");
        return;
      }

      if (tournament.group_assignments[player1Id] !== groupId || tournament.group_assignments[player2Id] !== groupId) {
        onDone("Group-stage matches must use players from the selected group only.");
        return;
      }
    }

    if (player1Id === player2Id) {
      onDone("Choose two different players.");
      return;
    }

    await createMatch({
      tournament_id: tournament.id,
      round: stage.round,
      stage_id: stage.id,
      group_id: stage.type === "group" ? groupId : null,
      player1_id: player1Id,
      player2_id: player2Id
    });

    setPlayer1Id("");
    setPlayer2Id("");
    onDone("Match created.");
  }

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <div className="border-b border-neutral-800 pb-4">
        <h3 className="font-serif text-2xl text-on-surface">Add Match</h3>
        <p className="mt-2 text-sm text-on-surface-variant">Group-stage pairings are locked to the selected group. Knockout stages accept any rostered players.</p>
      </div>

      {rosterPlayers.length < 2 ? (
        <p className="pt-5 text-sm text-on-surface-variant">Tournament roster is empty or incomplete. Add at least two players in the roster section first.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-5 grid gap-4">
          <SelectInput
            label="Stage"
            value={stageId}
            onChange={(value) => {
              setStageId(value);
              setGroupId("");
              setPlayer1Id("");
              setPlayer2Id("");
            }}
            options={tournament.stages.map((stageItem) => ({ value: stageItem.id, label: stageItem.name }))}
            required
          />
          {stage?.type === "group" ? (
            <SelectInput
              label="Group"
              value={groupId}
              onChange={(value) => {
                setGroupId(value);
                setPlayer1Id("");
                setPlayer2Id("");
              }}
              options={(stage.groups ?? []).map((groupCode) => ({ value: groupCode, label: `Group ${groupCode}` }))}
              required
            />
          ) : null}
          <SelectInput label="White" value={player1Id} onChange={setPlayer1Id} options={eligiblePlayers.map((player) => ({ value: player.id, label: player.name }))} required />
          <SelectInput label="Black" value={player2Id} onChange={setPlayer2Id} options={eligiblePlayers.map((player) => ({ value: player.id, label: player.name }))} required />
          {stage?.type === "group" && groupId && eligiblePlayers.length < 2 ? (
            <p className="text-sm text-on-surface-variant">This group does not yet have enough assigned players to create a match.</p>
          ) : null}
          <button className="min-h-12 bg-primary px-5 text-xs font-bold uppercase tracking-[0.16em] text-on-primary">Create match</button>
        </form>
      )}
    </section>
  );
}

function MatchEditorCard({
  match,
  tournament,
  players,
  onDone
}: {
  match: Match;
  tournament: Tournament;
  players: Player[];
  onDone: (message: string) => void;
}) {
  const [stageId, setStageId] = useState(match.stage_id);
  const [groupId, setGroupId] = useState(match.group_id ?? "");
  const [player1Id, setPlayer1Id] = useState(match.player1_id);
  const [player2Id, setPlayer2Id] = useState(match.player2_id);
  const [result, setResult] = useState<MatchResult>(match.result);
  const [pgn, setPgn] = useState(match.pgn ?? "");
  const stage = tournament.stages.find((item) => item.id === stageId) ?? tournament.stages[0] ?? null;
  const eligiblePlayers = stage?.type === "group"
    ? players.filter((player) => tournament.group_assignments[player.id] === groupId || player.id === player1Id || player.id === player2Id)
    : players;

  return (
    <section className="border border-neutral-800 bg-surface-container p-5">
      <h3 className="font-serif text-2xl text-on-surface">Edit Match</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();

          if (player1Id === player2Id) {
            onDone("Choose two different players.");
            return;
          }

          if (stage?.type === "group") {
            if (!groupId) {
              onDone("Choose a group for the group-stage match.");
              return;
            }

            if (tournament.group_assignments[player1Id] !== groupId || tournament.group_assignments[player2Id] !== groupId) {
              onDone("Group-stage matches must use players from the selected group only.");
              return;
            }
          }

          await updateMatch(match.id, {
            round: stage?.round ?? match.round,
            stage_id: stageId,
            group_id: stage?.type === "group" ? groupId : null,
            player1_id: player1Id,
            player2_id: player2Id,
            result,
            pgn
          });
          onDone("Match updated.");
        }}
        className="mt-5 grid gap-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            label="Stage"
            value={stageId}
            onChange={(value) => {
              setStageId(value);
              setGroupId("");
              setPlayer1Id("");
              setPlayer2Id("");
            }}
            options={tournament.stages.map((stageItem) => ({ value: stageItem.id, label: stageItem.name }))}
            required
          />
          {stage?.type === "group" ? (
            <SelectInput
              label="Group"
              value={groupId}
              onChange={(value) => {
                setGroupId(value);
                setPlayer1Id("");
                setPlayer2Id("");
              }}
              options={(stage.groups ?? []).map((groupCode) => ({ value: groupCode, label: `Group ${groupCode}` }))}
              required
            />
          ) : (
            <StaticMetric label="Round" value={`Round ${stage?.round ?? match.round}`} />
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput label="White" value={player1Id} onChange={setPlayer1Id} options={eligiblePlayers.map((player) => ({ value: player.id, label: player.name }))} required />
          <SelectInput label="Black" value={player2Id} onChange={setPlayer2Id} options={eligiblePlayers.map((player) => ({ value: player.id, label: player.name }))} required />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Result</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {results.map((option) => (
              <button
                key={option ?? "clear"}
                type="button"
                onClick={() => setResult(option)}
                className={`min-h-10 border px-3 text-xs font-bold uppercase tracking-[0.14em] ${
                  result === option ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"
                }`}
              >
                {formatResult(option)}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">PGN</span>
          <textarea
            value={pgn}
            onChange={(event) => setPgn(event.target.value)}
            rows={10}
            className="mt-2 w-full border border-outline-variant bg-surface-dim px-3 py-3 font-mono text-xs text-on-surface outline-none focus:border-primary"
            placeholder={'[Event "Tournament"]'}
          />
        </label>

        <button className="min-h-12 border border-primary px-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">Save match</button>
      </form>
    </section>
  );
}

function EmptyAdminState({
  title,
  detail,
  actionLabel,
  onAction
}: {
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="border border-neutral-800 bg-surface-container p-6">
      <h2 className="font-serif text-3xl text-on-surface">{title}</h2>
      <p className="mt-3 text-sm text-on-surface-variant">{detail}</p>
      <button onClick={onAction} className="mt-5 min-h-11 border border-outline-variant px-4 text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">
        {actionLabel}
      </button>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  className = "",
  type = "text",
  required,
  min,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
  required?: boolean;
  min?: number;
  placeholder?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        min={min}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full border border-outline-variant bg-surface-dim px-3 py-3 text-sm text-on-surface outline-none focus:border-primary"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  required,
  className = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void | Promise<void>;
  options: Array<string | { value: string; label: string }>;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          void onChange(event.target.value);
        }}
        required={required}
        className="mt-2 w-full border border-outline-variant bg-surface-dim px-3 py-3 text-sm text-on-surface outline-none focus:border-primary"
      >
        <option value="">Select</option>
        {options.map((option) => {
          const normalized = typeof option === "string" ? { value: option, label: option } : option;

          return (
            <option key={normalized.value} value={normalized.value}>
              {normalized.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function StaticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="block">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{label}</span>
      <div className="mt-2 min-h-[48px] border border-outline-variant bg-surface-dim px-3 py-3 text-sm text-on-surface">{value}</div>
    </div>
  );
}

function parseEloInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const elo = Number(trimmed);
  return Number.isInteger(elo) && elo >= 0 ? elo : null;
}

function formatElo(elo: number | null) {
  return elo === null ? "No ELO" : `ELO ${elo}`;
}

function formatResult(result: MatchResult) {
  if (result === "1/2-1/2") {
    return "1/2-1/2";
  }

  return result ?? "Clear";
}

function parseBulkPlayers(rawLines: string):
  | { ok: true; players: Array<{ name: string; elo: number | null }> }
  | { ok: false; error: string } {
  const players: Array<{ name: string; elo: number | null }> = [];
  const lines = rawLines.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (!line) {
      continue;
    }

    const [namePart, eloPart, extra] = line.split(",").map((part) => part.trim());

    if (!namePart) {
      return { ok: false, error: `Line ${index + 1} is missing a player name.` };
    }

    if (extra !== undefined) {
      return { ok: false, error: `Line ${index + 1} has too many comma-separated values.` };
    }

    const elo = eloPart ? parseEloInput(eloPart) : null;

    if (eloPart && elo === null) {
      return { ok: false, error: `Line ${index + 1} has an invalid ELO.` };
    }

    players.push({ name: namePart, elo });
  }

  return { ok: true, players };
}

function parseGroupCodes(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function syncStagesToRoundCount(stages: TournamentStage[], rounds: number) {
  const defaults = createDefaultStages(rounds);

  return defaults.map((stage, index) => {
    const current = stages[index];

    if (!current) {
      return stage;
    }

    return {
      ...stage,
      name: current.type === "knockout" ? current.name : stage.name,
      groups: current.type === "group" ? (current.groups?.length ? current.groups : stage.groups) : undefined
    };
  });
}

function getStageName(tournament: Tournament, stageId: string) {
  return tournament.stages.find((stage) => stage.id === stageId)?.name ?? "Stage";
}
