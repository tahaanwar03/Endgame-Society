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
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <section className="w-full max-w-md border border-neutral-800 bg-surface-container-low p-6">
        <Link href="/" className="font-serif text-xl font-bold italic text-primary">
          The Endgame Society
        </Link>
        <h1 className="mt-8 font-serif text-3xl text-on-surface">Admin Login</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Use the Firebase admin email/password configured for this portal.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="mt-2 w-full border border-outline-variant bg-surface-dim px-3 py-3 text-on-surface outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="mt-2 w-full border border-outline-variant bg-surface-dim px-3 py-3 text-on-surface outline-none focus:border-primary"
            />
          </label>
          {error ? <p className="border border-error-container bg-error-container/20 p-3 text-sm text-error">{error}</p> : null}
          <button
            disabled={submitting}
            className="min-h-12 w-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
