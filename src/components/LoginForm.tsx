"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth-hooks";

export function LoginForm() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuthUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const services = getFirebaseServices();

      if (!services) {
        throw new Error("Firebase environment variables are not configured.");
      }

      await signInWithEmailAndPassword(services.auth, email, password);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!loading && user && isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, loading, router, user]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#050505] px-4">
      <section className="w-full max-w-[400px] ring-1 ring-white/[0.06] bg-[#0a0a0a] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <Link href="/" className="font-serif text-xl font-bold uppercase tracking-[0.06em] text-gold-gradient">
          Endgame
        </Link>
        <h1 className="mt-10 font-serif text-3xl uppercase tracking-[0.02em] text-neutral-200">Admin Portal</h1>
        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-neutral-600">Access Restricted</p>

        <form onSubmit={onSubmit} className="mt-10 space-y-5">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Email Address</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="mt-2 h-11 w-full border border-white/[0.08] bg-[#0d0d0d] px-4 text-sm text-neutral-200 outline-none transition-colors focus:border-[#b79262]/50"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="mt-2 h-11 w-full border border-white/[0.08] bg-[#0d0d0d] px-4 text-sm text-neutral-200 outline-none transition-colors focus:border-[#b79262]/50"
            />
          </label>
          {error ? <p className="border border-red-900/30 bg-red-900/10 p-3 text-[11px] text-red-500">{error}</p> : null}
          <button
            disabled={submitting}
            className="min-h-11 w-full bg-[#b79262] px-5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#0a0a0a] transition-all hover:bg-[#c9a678] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Verifying..." : "Enter Portal"}
          </button>
        </form>
      </section>
    </main>
  );
}
