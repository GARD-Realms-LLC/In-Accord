"use client";

import Link from "next/link";
import qs from "query-string";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Video, VideoOff } from "lucide-react";

import { ActionTooltip } from "@/components/action-tooltip";

interface ChatVideoButtonProps {
  href?: string;
  isActive?: boolean;
}

export const ChatVideoButton = ({ href, isActive = false }: ChatVideoButtonProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isVideo = href ? isActive : Boolean(searchParams?.get("video"));

  const onClick = () => {
    const url = qs.stringifyUrl(
      {
        url: pathname || "",
        query: {
          video: isVideo ? undefined : true,
        },
      },
      { skipNull: true }
    );

    router.push(url);
  };

  const Icon = isVideo ? VideoOff : Video;
  const tooltipLabel = isVideo ? "End video call" : "Start video call";

  return (
    <ActionTooltip side="bottom" label={tooltipLabel} align="center">
      {href ? (
        <Link href={href} className="hover:opacity-75 transition mr-4">
          <Icon className="h-6 w-6 text-zinc-500 dark:text-zinc-400" suppressHydrationWarning />
        </Link>
      ) : (
        <button type="button" onClick={onClick} className="hover:opacity-75 transition mr-4">
          <Icon className="h-6 w-6 text-zinc-500 dark:text-zinc-400" suppressHydrationWarning />
        </button>
      )}
    </ActionTooltip>
  );
};
