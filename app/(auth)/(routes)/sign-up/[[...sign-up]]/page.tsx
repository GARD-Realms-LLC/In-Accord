"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
        placeholder="Full Name"
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
        onChange={(e) => {
          const value = e.target.value;
          setDateOfBirth(value);

          if (isUnderMinimumAge(value)) {
            setIsAgeModalOpen(true);
          }
        }}
      />
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">
          Account Type
        </label>
        <select
          className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2 text-sm"
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

      <Dialog open={isAgeModalOpen} onOpenChange={setIsAgeModalOpen}>
        <DialogContent className="max-w-md bg-[#1b1c20] text-[#f2f3f5]">
          <DialogTitle className="text-base font-bold">Age Requirement</DialogTitle>
          <p className="mt-2 text-sm leading-relaxed">
            Must be 15 or older for an account, please have a legal guardian create one for you from there account.
          </p>
        </DialogContent>
      </Dialog>
    </form>
  );
}