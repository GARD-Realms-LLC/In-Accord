"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { toInAboardImageUrl } from "@/lib/in-aboard-image-url";

type PublicEntry = {
  serverId: string;
  serverName: string;
  imageUrl: string | null;
  bannerUrl: string | null;
  tags: string[];
  ownerDisplayName: string;
  description: string;
  bumpCount: number;
  lastBumpedAt: string | null;
};

type ManagedEntry = PublicEntry & {
  listed: boolean;
  manageToken: string;
};

const formatRelativeBump = (value: string | null) => {
  if (!value) {
    return "Never bumped";
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "Unknown bump time";
  }

  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs < 60_000) {
    return "Just bumped";
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 48) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
};

export default function InAboardPage() {
  const [token, setToken] = useState("");

  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [managed, setManaged] = useState<ManagedEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingManaged, setIsSavingManaged] = useState(false);

  const [managedDescription, setManagedDescription] = useState("");
  const [managedListed, setManagedListed] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "bumps" | "name">("recent");

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const response = await fetch(`/api/our-board${query}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        entries?: PublicEntry[];
        managed?: ManagedEntry | null;
      };

      const nextEntries = Array.isArray(payload.entries) ? payload.entries : [];
      const nextManaged = payload.managed ?? null;

      setEntries(nextEntries);
      setManaged(nextManaged);
      setManagedDescription(nextManaged?.description ?? "");
      setManagedListed(Boolean(nextManaged?.listed ?? true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load In-Aboard.");
      setEntries([]);
      setManaged(null);
    } finally {
      setIsLoading(false);
    }
  };

  const onSaveManaged = async () => {
    if (!token || !managed) {
      return;
    }

    try {
      setIsSavingManaged(true);
      setError(null);

      const response = await fetch("/api/our-board", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          listed: managedListed,
          description: managedDescription,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save listing settings.");
    } finally {
      setIsSavingManaged(false);
    }
  };

  useEffect(() => {
    const syncTokenFromLocation = () => {
      if (typeof window === "undefined") {
        return;
      }

      const nextToken = new URLSearchParams(window.location.search).get("token");
      setToken(String(nextToken ?? "").trim());
    };

    syncTokenFromLocation();
    window.addEventListener("popstate", syncTokenFromLocation);

    return () => {
      window.removeEventListener("popstate", syncTokenFromLocation);
    };
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalBumps = entries.reduce((sum, entry) => sum + entry.bumpCount, 0);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (!query) {
        return true;
      }

      const haystack = [entry.serverName, entry.ownerDisplayName, entry.description, ...(entry.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((left, right) => left.serverName.localeCompare(right.serverName));
      return sorted;
    }

    if (sortBy === "bumps") {
      sorted.sort((left, right) => {
        if (left.bumpCount !== right.bumpCount) {
          return right.bumpCount - left.bumpCount;
        }

        const leftBumped = left.lastBumpedAt ? new Date(left.lastBumpedAt).getTime() : 0;
        const rightBumped = right.lastBumpedAt ? new Date(right.lastBumpedAt).getTime() : 0;
        return rightBumped - leftBumped;
      });
      return sorted;
    }

    sorted.sort((left, right) => {
      const leftBumped = left.lastBumpedAt ? new Date(left.lastBumpedAt).getTime() : 0;
      const rightBumped = right.lastBumpedAt ? new Date(right.lastBumpedAt).getTime() : 0;
      return rightBumped - leftBumped;
    });
    return sorted;
  }, [entries, searchQuery, sortBy]);

  return (
    <main className="min-h-screen bg-[#1e1f22] text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <header className="overflow-hidden rounded-2xl border border-[#3f4452] bg-[#2b2d31]">
          <div className="border-b border-[#3f4452] bg-gradient-to-r from-[#5865f2] via-[#4f5ad5] to-[#3e48a3] px-6 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-100/90">Server Discovery</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">In-Aboard</h1>
            <p className="mt-3 max-w-3xl text-sm text-indigo-100/95 sm:text-base">
              A public server discovery board for In-Accord. Bump your server every 60 minutes with <span className="font-semibold">/bump</span> to stay near the top.
            </p>
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-6">
            <div className="rounded-lg border border-[#3f4452] bg-[#232428] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Listed Servers</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{entries.length}</p>
            </div>
            <div className="rounded-lg border border-[#3f4452] bg-[#232428] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Total Bumps</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{totalBumps}</p>
            </div>
            <div className="rounded-lg border border-[#3f4452] bg-[#232428] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Bump Cooldown</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">60m</p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#3f4452] px-4 py-4 sm:grid-cols-[1fr_170px] sm:px-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search servers, owners, or keywords"
              className="h-10 rounded-lg border border-[#4a5061] bg-[#1f2126] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-400"
            />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "recent" | "bumps" | "name")}
              className="h-10 rounded-lg border border-[#4a5061] bg-[#1f2126] px-3 text-sm text-zinc-100 outline-none focus:border-indigo-400"
            >
              <option value="recent">Sort: Most Recent Bump</option>
              <option value="bumps">Sort: Most Bumps</option>
              <option value="name">Sort: Server Name</option>
            </select>
          </div>
        </header>

        {token && managed ? (
          <section className="mt-6 rounded-xl border border-indigo-500/40 bg-[#252744] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo-200">Owner-Only Management</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{managed.serverName}</p>
            <p className="mt-2 text-sm text-zinc-200">
              In-Aboard settings can only be managed by the server owner in <span className="font-semibold">Edit Server → In-Aboard</span>.
            </p>
          </section>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        <section className="mt-6">
          {isLoading ? (
            <p className="text-sm text-zinc-300">Loading board...</p>
          ) : visibleEntries.length === 0 ? (
            <p className="rounded-lg border border-[#3f4452] bg-[#2b2d31] px-3 py-3 text-sm text-zinc-300">
              {entries.length === 0 ? "No public servers yet." : "No servers matched your search."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {visibleEntries.map((entry, index) => (
                <article key={entry.serverId} className="overflow-hidden rounded-xl border border-[#3f4452] bg-[#2b2d31]">
                  {entry.bannerUrl ? (
                    <div className="relative h-28 w-full border-b border-[#3f4452] bg-[#232428] sm:h-32">
                      <Image
                        src={toInAboardImageUrl(entry.bannerUrl) || "/in-accord-steampunk-logo.png"}
                        alt={`${entry.serverName} banner`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[#5b6276] bg-[#232428] px-2 text-[11px] font-bold text-zinc-200">
                          #{index + 1}
                        </span>
                        <span className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#5b6276] bg-[#1e1f22]">
                          <Image
                            src={toInAboardImageUrl(entry.imageUrl) || "/in-accord-steampunk-logo.png"}
                            alt={`${entry.serverName} icon`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold text-zinc-100">{entry.serverName}</h2>
                          <p className="truncate text-xs text-zinc-400">Owner: {entry.ownerDisplayName}</p>
                        </div>
                      </div>

                      {(entry.tags ?? []).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.tags.map((tag) => (
                            <span
                              key={`${entry.serverId}-${tag}`}
                              className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-300">{entry.description || "No description yet."}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <div className="rounded-md border border-[#4d5366] bg-[#232428] px-2.5 py-1.5 text-xs text-zinc-200">
                        <span className="font-semibold">{entry.bumpCount}</span> bumps
                      </div>
                      <div className="rounded-md border border-[#4d5366] bg-[#232428] px-2.5 py-1.5 text-xs text-zinc-300">
                        {formatRelativeBump(entry.lastBumpedAt)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
