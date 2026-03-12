import Link from "next/link";

type InviteInvalidPageProps = {
  searchParams: Promise<{
    reason?: string;
    code?: string;
  }>;
};

const reasonCopyMap: Record<string, { title: string; description: string }> = {
  expired: {
    title: "Invite expired",
    description: "This invite link has expired. Ask for a fresh invite from a server admin.",
  },
  "max-uses": {
    title: "Invite no longer available",
    description: "This invite has reached its maximum number of uses.",
  },
  banned: {
    title: "Unable to join",
    description: "Your account is not allowed to join from this invite.",
  },
  invalid: {
    title: "Invalid invite",
    description: "This invite link is invalid or no longer exists.",
  },
};

export default async function InviteInvalidPage({ searchParams }: InviteInvalidPageProps) {
  const query = await searchParams;
  const reason = String(query.reason ?? "invalid").trim().toLowerCase();
  const code = String(query.code ?? "").trim();

  const copy = reasonCopyMap[reason] ?? reasonCopyMap.invalid;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111214] px-4 py-10 text-white">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1b1e] p-6 shadow-2xl shadow-black/40">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Invite</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{copy.title}</h1>
        <p className="mt-2 text-sm text-zinc-300">{copy.description}</p>

        {code ? (
          <div className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
            Invite code: <span className="font-mono text-zinc-100">{code}</span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Back to Home
          </Link>
          <Link
            href="/users"
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/20 bg-black/25 px-4 text-sm font-semibold text-zinc-100 transition hover:bg-black/35"
          >
            Open App
          </Link>
        </div>
      </div>
    </main>
  );
}
