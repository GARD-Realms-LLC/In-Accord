"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const search = useSearchParams();
  const fallbackPath = useMemo(() => search?.get("next") || "/users", [search]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        setError(text || "Invalid credentials");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { redirectTo?: string }
        | null;
      const redirectTo =
        payload?.redirectTo && payload.redirectTo.startsWith("/")
          ? payload.redirectTo
          : fallbackPath;

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to sign in right now");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-black/20 bg-[#232428] p-6 text-white">
      <h1 className="text-xl font-bold">Sign in</h1>
      <input
        className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2"
        placeholder="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2"
        placeholder="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-md bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60">
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-xs text-zinc-300">
        Need an account? <Link href="/sign-up" className="underline">Sign up</Link>
      </p>
    </form>
  );
}