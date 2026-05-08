"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { useGame, useMatch, usePlayers } from "@/lib/firestore-hooks";
import { getPlayerName } from "@/lib/standings";

const Chessboard = dynamic(() => import("react-chessboard").then((mod) => mod.Chessboard), {
  ssr: false,
  loading: () => <div className="aspect-square w-full bg-[#1c1b1b]" />
});

function useBoardWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => { setWidth(Math.floor(entry.contentRect.width)); });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function parsePgn(pgn?: string) {
  if (!pgn?.trim()) return { moves: [] as string[], error: null };
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    return { moves: game.history(), error: null };
  } catch (error) {
    return { moves: [] as string[], error: error instanceof Error ? error.message : "Invalid PGN." };
  }
}

function fenAtPly(moves: string[], ply: number) {
  const game = new Chess();
  for (let i = 0; i < ply; i++) game.move(moves[i]);
  return game.fen();
}

export function MatchViewer({ matchId }: { matchId: string }) {
  const matchState = useMatch(matchId);
  const gameState = useGame(matchId);
  const players = usePlayers();
  const { ref, width } = useBoardWidth();
  const [ply, setPly] = useState(0);

  const manualMatch = matchState.data;
  const lichessGame = !manualMatch ? gameState.data : null;
  const pgn = manualMatch?.pgn ?? lichessGame?.movesPgn ?? "";
  const parsed = useMemo(() => parsePgn(pgn), [pgn]);
  const fen = useMemo(() => fenAtPly(parsed.moves, ply), [parsed.moves, ply]);

  useEffect(() => { setPly(0); }, [pgn]);

  if (matchState.loading || gameState.loading || (manualMatch ? players.loading : false)) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <LoadingState label="Loading match" />
      </main>
    );
  }

  const error = matchState.error || gameState.error || players.error;
  if (error) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Match data unavailable" detail={error} />
      </main>
    );
  }

  if (!manualMatch && !lichessGame) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Match not found" detail="This match may have been removed or not published yet." />
      </main>
    );
  }

  const whiteName = manualMatch
    ? (!manualMatch.player1_id ? "TBD" : getPlayerName(players.data, manualMatch.player1_id))
    : lichessGame!.white;
  const blackName = manualMatch
    ? (!manualMatch.player2_id ? "TBD" : getPlayerName(players.data, manualMatch.player2_id))
    : lichessGame!.black;
  const result = manualMatch?.result ?? lichessGame?.result ?? null;

  const movePairs = Array.from({ length: Math.ceil(parsed.moves.length / 2) }, (_, i) => ({
    number: i + 1,
    white: parsed.moves[i * 2],
    black: parsed.moves[i * 2 + 1]
  }));

  return (
    <main className="mx-auto max-w-container animate-fade-up in-view px-4 py-8 md:px-8 md:py-14">
      {/* ── Match header ─────────────────────────────────── */}
      <section className="mb-8">
        {/* Source label */}
        <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.28em] text-neutral-600">
          {manualMatch ? `Round ${manualMatch.round}` : "Lichess archive"}
        </p>

        {/* Players vs result — the centrepiece */}
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          {/* White */}
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-600">White</p>
            <h1 className="font-serif text-2xl uppercase tracking-[0.04em] text-gold-gradient md:text-3xl">
              {whiteName}
            </h1>
          </div>

          {/* Result centrepiece */}
          <div className="flex flex-col items-center gap-1">
            <span className="h-px w-12 bg-gradient-to-r from-transparent via-[#b79262]/50 to-transparent" />
            <p className="font-serif text-4xl font-bold text-[#f2ca50] md:text-5xl">
              {result ?? "vs"}
            </p>
            <span className="h-px w-12 bg-gradient-to-r from-transparent via-[#b79262]/50 to-transparent" />
          </div>

          {/* Black */}
          <div className="md:text-right">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-600">Black</p>
            <h2 className="font-serif text-2xl uppercase tracking-[0.04em] text-gold-gradient md:text-3xl">
              {blackName}
            </h2>
          </div>
        </div>

        {/* Hairline divider */}
        <div className="mt-6 h-px bg-gradient-to-r from-transparent via-[#b79262]/30 to-transparent" />
      </section>

      {!pgn.trim() ? (
        <EmptyState
          title="No game data available"
          detail={manualMatch ? "Admin can add PGN for this match from the admin panel." : "The sync engine has not mirrored PGN for this game yet."}
        />
      ) : parsed.error ? (
        <EmptyState title="Invalid PGN" detail={parsed.error} />
      ) : (
        <section className="grid gap-5 lg:grid-cols-12">
          {/* ── Board ──────────────────────────────────── */}
          <div className="ring-1 ring-white/[0.06] bg-[#0f0f0f] p-px shadow-[0_8px_40px_rgba(0,0,0,0.5)] lg:col-span-7">
            <div className="bg-[#1a1a1a] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-5">
              <div ref={ref} className="mx-auto max-w-[680px]">
                <Chessboard
                  id="endgame-match-board"
                  position={fen}
                  boardWidth={Math.min(width, 680)}
                  arePiecesDraggable={false}
                  customDarkSquareStyle={{ backgroundColor: "#2a2520" }}
                  customLightSquareStyle={{ backgroundColor: "#c9b99a" }}
                  customBoardStyle={{ border: "3px solid #26231d" }}
                />
              </div>

              {/* Controls */}
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPly((v) => Math.max(0, v - 1))}
                  disabled={ply === 0}
                  className="min-h-10 flex-1 border border-white/[0.08] px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 transition hover:border-[#b79262]/50 hover:text-neutral-200 disabled:opacity-30 active:scale-[0.97]"
                >
                  ← Prev
                </button>
                <span className="min-w-[60px] text-center text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-600">
                  {ply} / {parsed.moves.length}
                </span>
                <button
                  type="button"
                  onClick={() => setPly((v) => Math.min(parsed.moves.length, v + 1))}
                  disabled={ply === parsed.moves.length}
                  className="min-h-10 flex-1 border border-[#b79262]/60 bg-[#b79262]/10 px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#f2ca50] transition hover:bg-[#b79262]/20 disabled:opacity-30 active:scale-[0.97]"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* ── Move list ──────────────────────────────── */}
          <div className="ring-1 ring-white/[0.06] lg:col-span-5">
            {/* Header */}
            <div className="flex items-center gap-3 bg-[#0a0a0a] px-5 py-3 border-b border-white/[0.05]">
              <span className="h-1.5 w-1.5 rotate-45 bg-[#b79262]" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">Move List</h2>
            </div>

            <div className="max-h-[480px] overflow-y-auto hide-scrollbar p-2 lg:max-h-[620px]">
              {movePairs.map((move) => (
                <div key={move.number} className="grid grid-cols-[40px_1fr_1fr] items-center gap-1 text-sm">
                  <span className="px-2 py-2 text-[10px] font-bold text-neutral-700 tabular-nums">{move.number}.</span>
                  <button
                    type="button"
                    onClick={() => setPly(move.number * 2 - 1)}
                    className={`rounded-sm px-2 py-2 text-left text-[11px] font-mono transition-colors duration-100 ${
                      ply === move.number * 2 - 1
                        ? "bg-[#b79262]/15 text-[#f2ca50]"
                        : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                    }`}
                  >
                    {move.white}
                  </button>
                  {move.black ? (
                    <button
                      type="button"
                      onClick={() => setPly(move.number * 2)}
                      className={`rounded-sm px-2 py-2 text-left text-[11px] font-mono transition-colors duration-100 ${
                        ply === move.number * 2
                          ? "bg-[#b79262]/15 text-[#f2ca50]"
                          : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                      }`}
                    >
                      {move.black}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
