"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

const links = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/admin", label: "Admin" }
];

export function AppHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#221d14] bg-[#0a0a0a]/95 backdrop-blur-[6px]">
      <div className="mx-auto flex h-16 w-full max-w-container items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/logo-square.png"
            alt=""
            width={28}
            height={28}
            priority={false}
            sizes="28px"
            className="h-7 w-7 rounded-sm border border-[#2a2218] bg-[#0d0b08] md:h-8 md:w-8"
          />
          <span className="font-serif text-lg font-bold uppercase tracking-[0.06em] text-gold-gradient md:text-xl">
            Endgame
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-xs font-bold uppercase tracking-[0.16em] md:flex">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "border-b-2 border-[#b79262] pb-1 text-[#f2ca50]"
                    : "text-neutral-500 transition-colors duration-150 hover:text-neutral-200"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="inline-flex h-11 w-11 items-center justify-center border border-[#2a2218] text-neutral-400 transition hover:border-[#b79262]/50 hover:text-neutral-200 md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M7 12h13M10 17h10" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-black/50 md:hidden"
          />
          <div className="absolute inset-x-0 top-16 z-50 border-b border-[#221d14] bg-[#080808] px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.8)] md:hidden">
            <nav className="grid gap-2">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-12 items-center justify-between border px-4 text-xs font-bold uppercase tracking-[0.16em] transition-colors duration-150 ${
                      active
                        ? "border-[#b79262] bg-[#b79262]/10 text-[#f2ca50]"
                        : "border-[#1e1e1e] bg-[#0a0a0a] text-neutral-400 hover:border-[#b79262]/30 hover:text-neutral-200"
                    }`}
                  >
                    <span>{link.label}</span>
                    <span className="text-[10px]">{active ? "Open" : "Go →"}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
