"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { INACCORD_BUILD_NUMBER, INACCORD_VERSION_LABEL } from "@/lib/build-version";

type AccountType = "NORMAL" | "BUSINESS" | "SCHOOL" | "FAMILY";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("NORMAL");
  const [showPassword, setShowPassword] = useState(false);
  const [isAgeModalOpen, setIsAgeModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getAgeFromDate = (value: string) => {
    if (!value) {
      return null;
    }

    const birthDate = new Date(value);

    if (Number.isNaN(birthDate.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
  };

  const isUnderMinimumAge = (value: string) => {
    const age = getAgeFromDate(value);
    return age !== null && age < 15;
  };

  const showAccountTypeInfoToast = () => {
    toast.custom(() => (
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#1b1c20] px-4 py-3 text-[#f2f3f5] shadow-xl">
        <p className="mb-3 text-sm">Normal: everyday social use.</p>

        <p className="mb-3 text-sm">Family: household-focused setup for adults to create family accounts. ID REQUIRED!</p>

        <p className="mb-3 text-sm">School: education-focused setup for Teachers and students and school communities. ID REQUIRED!</p>

        <p className="text-sm">Business: professional/business-oriented for company setup. ID REQUIRED!</p>
      </div>
    ));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isUnderMinimumAge(dateOfBirth)) {
      setIsAgeModalOpen(true);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phoneNumber, dateOfBirth, email, password, accountType }),
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
    <div className="relative w-full max-w-xl text-white">
      <div className="absolute inset-x-10 -top-6 h-12 rounded-full bg-black/35 blur-2xl" />
      <form onSubmit={onSubmit} className="relative w-full space-y-5 rounded-4xl border border-white/12 bg-[linear-gradient(180deg,rgba(36,40,51,0.94),rgba(18,20,28,0.98))] p-6 shadow-[0_40px_100px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl lg:p-8">
        <div className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/50 to-transparent" />
        <div className="absolute inset-x-8 bottom-0 h-10 rounded-full bg-black/30 blur-xl" />

        <div className="relative space-y-5">
          <div className="flex justify-center">
            <Image
              src="/in-accord-steampunk-logo.png"
              alt="In-Accord"
              width={432}
              height={216}
              className="h-auto w-72 rounded-2xl border border-white/10 shadow-[0_20px_44px_rgba(0,0,0,0.35)]"
              priority
            />
          </div>

          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_10px_30px_rgba(6,182,212,0.2)]">
              Account setup
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]">Create account</h1>
            <p className="mt-2 text-sm text-zinc-300">Create your account with the same centered auth layout and live background restored.</p>
          </div>

          <input
            className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 text-white shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 text-white shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
            placeholder="Phone Number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            maxLength={32}
            autoComplete="tel"
          />
          <input
            className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 text-white shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none"
            type="date"
            value={dateOfBirth}
            onChange={(e) => {
              const value = e.target.value;
              setDateOfBirth(value);

              if (isUnderMinimumAge(value)) {
                setIsAgeModalOpen(true);
              }
            }}
          />
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
            <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">
              Account Type
            </label>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#16181f] px-3 py-2 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.22)] outline-none"
              value={accountType}
              onChange={(event) => {
                const nextType =
                  event.target.value === "BUSINESS"
                    ? "BUSINESS"
                    : event.target.value === "SCHOOL"
                      ? "SCHOOL"
                      : event.target.value === "FAMILY"
                        ? "FAMILY"
                      : "NORMAL";
                setAccountType(nextType);
                showAccountTypeInfoToast();
              }}
            >
              <option value="NORMAL">Normal Account</option>
              <option value="BUSINESS">Business Account</option>
              <option value="SCHOOL">School Account</option>
              <option value="FAMILY">Family Account</option>
            </select>
            <button
              type="button"
              onClick={showAccountTypeInfoToast}
              className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
            >
              What’s the difference?
            </button>
          </div>
          <input
            className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 text-white shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="relative rounded-[1.4rem] border border-white/10 bg-[#14161c] p-1 shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
            <input
              className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 pr-12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
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
              className="absolute inset-y-0 right-2 inline-flex w-10 items-center justify-center rounded-xl text-zinc-300 transition hover:bg-white/5 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <button disabled={loading} className="w-full rounded-[1.35rem] border border-indigo-300/30 bg-[linear-gradient(180deg,#818cf8,#4f46e5)] px-4 py-3.5 font-semibold text-white shadow-[0_24px_44px_rgba(79,70,229,0.35),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60">
            {loading ? "Creating..." : "Sign up"}
          </button>
          <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-2 text-xs text-zinc-300">
            <p>
              Already have an account? <Link href="/sign-in" className="font-semibold text-cyan-300 underline underline-offset-4">Sign in</Link>
            </p>
          </div>
          <p className="pt-1 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            Version {INACCORD_VERSION_LABEL} • Build #{INACCORD_BUILD_NUMBER}
          </p>
        </div>

        <Dialog open={isAgeModalOpen} onOpenChange={setIsAgeModalOpen}>
          <DialogContent className="max-w-md bg-[#1b1c20] text-[#f2f3f5]">
            <DialogTitle className="text-base font-bold">Age Requirement</DialogTitle>
            <p className="mt-2 text-sm leading-relaxed">
              Must be 15 or older for an account, please have a legal guardian create one for you from there account.
            </p>
          </DialogContent>
        </Dialog>
      </form>
    </div>
  );
}