"use client";

import { useEffect, useState } from "react";

export function LoadingState({ label = "Syncing portal data" }: { label?: string }) {
  const [index, setIndex] = useState(0);
  const emojis = ["♔", "♕", "♖", "♗", "♘", "♙"];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % emojis.length);
    }, 200);
    return () => clearInterval(timer);
  }, [emojis.length]);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-3xl text-[#b79262] transition-all duration-200">
        {emojis[index]}
      </div>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-600">
        {label}
      </p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="ring-1 ring-white/[0.05] bg-[#080808]/50 p-8 text-center md:p-12">
      <div className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rotate-45 border border-[#b79262]/30">
        <span className="h-1.5 w-1.5 bg-[#b79262]" />
      </div>
      <h2 className="font-serif text-xl uppercase tracking-[0.06em] text-neutral-300 md:text-2xl">{title}</h2>
      {detail ? (
        <p className="mx-auto mt-3 max-w-md text-[11px] uppercase tracking-[0.12em] text-neutral-600 leading-relaxed">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
