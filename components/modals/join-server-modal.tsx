"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SearchServer = {
  id: string;
  name: string;
  imageUrl: string;
  inviteCode: string;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
};

export const JoinServerModal = () => {
  const router = useRouter();
  const { isOpen, onClose, type } = useModal();

  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<SearchServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joiningServerId, setJoiningServerId] = useState<string | null>(null);

  const isModalOpen = isOpen && type === "joinServer";

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!isModalOpen) {
      setQuery("");
      setServers([]);
      setError(null);
      setIsLoading(false);
      setJoiningServerId(null);
      return;
    }

    let cancelled = false;

    const loadServers = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const url = normalizedQuery.length > 0
          ? `/api/servers/search?query=${encodeURIComponent(normalizedQuery)}`
          : "/api/servers/search";

        const response = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Unable to load servers (${response.status})`);
        }

        const payload = (await response.json()) as { servers?: SearchServer[] };

        if (!cancelled) {
          setServers(payload.servers ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[JOIN_SERVER_MODAL_LOAD]", loadError);
          setError("Could not load servers right now.");
          setServers([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const timer = window.setTimeout(() => {
      void loadServers();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isModalOpen, normalizedQuery]);

  const onJoinServer = async (serverId: string, alreadyMember: boolean) => {
    try {
      setJoiningServerId(serverId);
      setError(null);

      if (!alreadyMember) {
        const response = await fetch("/api/servers/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId }),
        });

        if (!response.ok) {
          const message = (await response.text()) || "Unable to join server.";
          throw new Error(message);
        }
      }

      onClose();
      router.push(`/servers/${serverId}`);
      router.refresh();
    } catch (joinError) {
      console.error("[JOIN_SERVER_MODAL_JOIN]", joinError);
      setError(joinError instanceof Error ? joinError.message : "Unable to join server.");
    } finally {
      setJoiningServerId(null);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
          <DialogTitle className="text-xl font-bold">Join a Server</DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-300">
            Search for servers and join instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by server name, owner, or invite code"
              className="pl-9"
            />
          </div>

          <div className="mt-4 max-h-[380px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {isLoading ? (
              <p className="p-4 text-sm text-zinc-600 dark:text-zinc-300">Loading servers...</p>
            ) : error ? (
              <p className="p-4 text-sm text-rose-500">{error}</p>
            ) : servers.length === 0 ? (
              <p className="p-4 text-sm text-zinc-600 dark:text-zinc-300">No servers found.</p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {servers.map((server) => (
                  <div key={server.id} className="flex items-center gap-3 p-3">
                    <div className="relative h-10 w-10 overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-600">
                      <Image src={server.imageUrl} alt={server.name} fill className="object-cover" unoptimized />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{server.name}</p>
                      <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">
                        Owner: {server.ownerName} • Members: {server.memberCount}
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      disabled={joiningServerId === server.id}
                      onClick={() => void onJoinServer(server.id, server.isMember)}
                    >
                      {joiningServerId === server.id
                        ? "Working..."
                        : server.isMember
                          ? "Open"
                          : "Join"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
