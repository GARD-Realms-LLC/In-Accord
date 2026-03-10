"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function Page() {
  const router = useRouter();
  const search = useSearchParams();
  const fallbackPath = useMemo(() => search?.get("next") || "/users", [search]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    <form onSubmit={onSubmit} suppressHydrationWarning className="w-full max-w-md space-y-4 rounded-xl border border-black/20 bg-[#232428] p-6 text-white">
      <div className="flex justify-center">
        <Image
          src="/in-accord-steampunk-logo.png"
          alt="In-Accord"
          width={432}
          height={216}
          className="h-54 w-108 rounded-lg"
          suppressHydrationWarning
          priority
        />
      </div>
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
      <div className="relative">
        <input
          className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2 pr-10"
          placeholder="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-zinc-300 transition hover:text-white"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {isMounted ? (showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />) : null}
        </button>
      </div>
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