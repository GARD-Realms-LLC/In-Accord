"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string;
  decorationSrc?: string | null;
  className?: string;
}

export const UserAvatar = ({ src, decorationSrc, className }: UserAvatarProps) => {
  const resolvedAvatarUrl = resolveAvatarUrl(src);
  const resolvedDecorationUrl = resolveAvatarUrl(decorationSrc);

  return (
    <span className="relative inline-flex">
      <Avatar className={cn("h-7 w-7 md:h-10 md:w-10", className)}>
        <AvatarImage src={resolvedAvatarUrl ?? undefined} />
      </Avatar>

      {resolvedDecorationUrl ? (
        <span className="pointer-events-none absolute -inset-[18%] z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedDecorationUrl}
            alt="Avatar decoration"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </span>
      ) : null}
    </span>
  );
};
