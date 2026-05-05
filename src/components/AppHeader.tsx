"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/admin", label: "Admin" }
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-container items-center justify-between px-4 md:px-8">
        <Link href="/" className="font-serif text-lg font-bold italic text-primary md:text-xl">
          The Endgame Society
        </Link>
        <nav className="flex items-center gap-5 text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
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
      </div>
    </header>
  );
}
