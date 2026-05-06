"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { EmptyState, LoadingState } from "@/components/LoadingState";
import { useMatch, usePlayers } from "@/lib/firestore-hooks";
import { getPlayerName } from "@/lib/standings";

const Chessboard = dynamic(() => import("react-chessboard").then((mod) => mod.Chessboard), {
  ssr: false,
  loading: () => <div className="aspect-square w-full border border-neutral-800 bg-surface-container-high" />
});

function useBoardWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (!ref.current) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function parsePgn(pgn?: string) {
  if (!pgn?.trim()) {
    return { moves: [] as string[], error: null };
  }

  try {
    const game = new Chess();
    game.loadPgn(pgn);
    return { moves: game.history(), error: null };
  } catch (error) {
    return {
      moves: [] as string[],
      error: error instanceof Error ? error.message : "Invalid PGN."
    };
  }
}

function fenAtPly(moves: string[], ply: number) {
  const game = new Chess();

  for (let index = 0; index < ply; index += 1) {
    game.move(moves[index]);
  }

  return game.fen();
}

export function MatchViewer({ matchId }: { matchId: string }) {
  const matchState = useMatch(matchId);
  const players = usePlayers();
  const { ref, width } = useBoardWidth();
  const [ply, setPly] = useState(0);

  const pgn = matchState.data?.pgn ?? "";
  const parsed = useMemo(() => parsePgn(pgn), [pgn]);
  const fen = useMemo(() => fenAtPly(parsed.moves, ply), [parsed.moves, ply]);

  useEffect(() => {
    setPly(0);
  }, [pgn]);

  if (matchState.loading || players.loading) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <LoadingState label="Loading match" />
      </main>
    );
  }

  const error = matchState.error || players.error;

  if (error) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Match data unavailable" detail={error} />
      </main>
    );
  }

  const match = matchState.data;

  if (!match) {
    return (
      <main className="mx-auto max-w-container px-4 py-8 md:px-8">
        <EmptyState title="Match not found" detail="This match may have been removed or not published yet." />
      </main>
    );
  }

  const whiteName = !match.player1_id ? "TBD" : getPlayerName(players.data, match.player1_id);
  const blackName = !match.player2_id ? "TBD" : getPlayerName(players.data, match.player2_id);
  const movePairs = Array.from({ length: Math.ceil(parsed.moves.length / 2) }, (_, index) => ({
    number: index + 1,
    white: parsed.moves[index * 2],
    black: parsed.moves[index * 2 + 1]
  }));

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-12">
      <section className="mb-8 border-b border-outline-variant pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">Round {match.round}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <h1 className="font-serif text-3xl text-primary">{whiteName}</h1>
          <div className="text-center font-serif text-5xl text-on-surface">{match.result ?? "vs"}</div>
          <h2 className="font-serif text-3xl text-on-surface md:text-right">{blackName}</h2>
        </div>
      </section>

      {!pgn.trim() ? (
        <EmptyState title="No game data available" detail="Admin can add PGN for this match from the admin panel." />
      ) : parsed.error ? (
        <EmptyState title="Invalid PGN" detail={parsed.error} />
      ) : (
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="border border-neutral-800 bg-surface-container-low p-3 md:p-6 lg:col-span-7">
            <div ref={ref} className="mx-auto max-w-[680px]">
              <Chessboard
                id="endgame-match-board"
                position={fen}
                boardWidth={Math.min(width, 680)}
                arePiecesDraggable={false}
                customDarkSquareStyle={{ backgroundColor: "#353534" }}
                customLightSquareStyle={{ backgroundColor: "#d0c5af" }}
                customBoardStyle={{ border: "4px solid #2a2a2a" }}
              />
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPly((value) => Math.max(0, value - 1))}
                disabled={ply === 0}
                className="min-h-11 flex-1 border border-outline-variant px-4 text-xs font-bold uppercase tracking-[0.16em] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                {ply} / {parsed.moves.length}
              </span>
              <button
                type="button"
                onClick={() => setPly((value) => Math.min(parsed.moves.length, value + 1))}
                disabled={ply === parsed.moves.length}
                className="min-h-11 flex-1 border border-primary px-4 text-xs font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="border border-neutral-800 bg-surface-container lg:col-span-5">
            <h2 className="border-b border-neutral-800 bg-surface-container-high px-4 py-4 text-xs font-bold uppercase tracking-[0.2em]">
              Move List
            </h2>
            <div className="max-h-[620px] overflow-y-auto p-2">
              {movePairs.map((move) => (
                <div key={move.number} className="grid grid-cols-[48px_1fr_1fr] items-center gap-2 text-sm">
                  <span className="px-2 py-2 text-neutral-500">{move.number}.</span>
                  <button
                    type="button"
                    onClick={() => setPly(move.number * 2 - 1)}
                    className={`px-3 py-2 text-left ${ply === move.number * 2 - 1 ? "bg-primary/15 text-primary" : "hover:bg-neutral-900"}`}
                  >
                    {move.white}
                  </button>
                  {move.black ? (
                    <button
                      type="button"
                      onClick={() => setPly(move.number * 2)}
                      className={`px-3 py-2 text-left ${ply === move.number * 2 ? "bg-primary/15 text-primary" : "hover:bg-neutral-900"}`}
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
