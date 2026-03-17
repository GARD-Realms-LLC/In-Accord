"use client";

import { resolveAvatarUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";

interface ProfileEffectLayerProps {
  src?: string | null;
  className?: string;
  imageClassName?: string;
}

export const ProfileEffectLayer = ({ src, className, imageClassName }: ProfileEffectLayerProps) => {
  const resolvedSrc = resolveAvatarUrl(src);

  if (!resolvedSrc) {
    return null;
  }

  return (
    <span className={cn("pointer-events-none absolute inset-0 z-20 overflow-hidden", className)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt=""
        className={cn("h-full w-full object-cover", imageClassName)}
        draggable={false}
      />
    </span>
  );
};
