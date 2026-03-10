"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { buildChannelPath, buildServerPath } from "@/lib/route-slugs";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface ServerSearchProps {
  serverId: string;
  serverName: string;
  data: {
    label: string;
    type: "channel" | "member" | "server";
    data:
      | {
          icon: React.ReactNode;
          name: string;
          id: string;
        }[]
      | undefined;
  }[];
}

export const ServerSearch = ({ serverId, serverName, data }: ServerSearchProps) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onClick = ({
    id,
    type,
  }: {
    id: string;
    type: "channel" | "member" | "server";
  }) => {
    setOpen(false);

    if (type === "server") {
      return router.push(buildServerPath({ id, name: serverName }));
    }

    if (type === "member") {
      return router.push(`${buildServerPath({ id: serverId, name: serverName })}/conversations/${id}`);
    }

    if (type === "channel") {
      const channel = data
        .filter((group) => group.type === "channel")
        .flatMap((group) => group.data ?? [])
        .find((item) => item.id === id);

      if (!channel) {
        return router.push(buildServerPath({ id: serverId, name: serverName }));
      }

      return router.push(
        buildChannelPath({
          server: { id: serverId, name: serverName },
          channel: { id, name: channel.name },
        })
      );
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group px-2 py-2 rounbed-md 
        flex items-center gap-x-2 w-full hover:bg-zinc-700/10
        dark:hover:bg-zinc-700/50 transition"
      >
        <Search className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        <p
          className="font-semibold text-sm text-zinc-500 
        dark:text-zinc-400 group-hover:text-zinc-600 
        dark:group-hover:text-zinc-300 transition"
        >
          {serverName}
        </p>
        <kbd
          className="pointer-events-none inline-flex h-5 
          select-none items-center gap-1 rounded border 
          bg-muted px-1.5 font-mono text-[10px] font-medium 
          text-muted-foreground ml-auto"
        >
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search server name, channels, and members" />
        <CommandList>
          <CommandEmpty>No Results found</CommandEmpty>
          {data.map(({ label, type, data }) => {
            if (!data?.length) return null;

            return (
              <CommandGroup key={label} heading={label}>
                {data?.map(({ id, icon, name }) => {
                  return (
                    <CommandItem key={id} onSelect={() => onClick({ id, type })}>
                      {icon}
                      <span>{name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
};
