"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        setError(text || "Could not create account");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to sign up right now");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-black/20 bg-[#232428] p-6 text-white">
      <h1 className="text-xl font-bold">Create account</h1>
      <input
        className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
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
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-md bg-indigo-600 px-3 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-60">
        {loading ? "Creating..." : "Sign up"}
      </button>
      <p className="text-xs text-zinc-300">
        Already have an account? <a href="/sign-in" className="underline">Sign in</a>
      </p>
    </form>
  );
}