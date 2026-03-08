"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        body: JSON.stringify({ name, phoneNumber, dateOfBirth, email, password }),
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
      <div className="flex justify-center">
        <Image
          src="/in-accord-steampunk-logo.png"
          alt="In-Accord"
          width={432}
          height={216}
          className="h-54 w-108 rounded-lg"
          priority
        />
      </div>
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
        placeholder="Phone Number"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        maxLength={32}
        autoComplete="tel"
      />
      <input
        className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
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
      <div className="relative">
        <input
          className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2 pr-10"
          placeholder="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
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
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-md bg-indigo-600 px-3 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-60">
        {loading ? "Creating..." : "Sign up"}
      </button>
      <p className="text-xs text-zinc-300">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </form>
  );
}