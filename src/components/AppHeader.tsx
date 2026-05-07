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
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-container items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3 font-serif text-lg font-bold italic text-primary md:text-xl">
          <Image
            src="/brand/logo-square.png"
            alt=""
            width={28}
            height={28}
            priority={false}
            sizes="28px"
            className="h-7 w-7 rounded-sm border border-neutral-800 bg-neutral-950 md:h-8 md:w-8"
          />
          <span>The Endgame Society</span>
        </Link>
        <nav className="hidden items-center gap-5 text-xs font-bold uppercase tracking-[0.16em] text-neutral-400 md:flex">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "border-b-2 border-primary pb-1 text-primary" : "hover:text-primary"}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M7 12h13M10 17h10" />}
          </svg>
        </button>
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-black/50 md:hidden"
          />
          <div className="absolute inset-x-0 top-16 z-50 border-b border-neutral-800 bg-neutral-950/98 px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)] md:hidden">
            <nav className="grid gap-2">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-12 items-center justify-between border px-4 text-xs font-bold uppercase tracking-[0.16em] ${
                      active ? "border-primary bg-primary text-neutral-950" : "border-neutral-800 bg-neutral-900/70 text-neutral-200"
                    }`}
                  >
                    <span>{link.label}</span>
                    <span className="text-[10px]">{active ? "Open" : "Go"}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      ) : null}
    </header>
  );
}
