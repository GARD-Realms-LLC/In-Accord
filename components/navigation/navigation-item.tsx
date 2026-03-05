"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";

interface NavigationItemProps {
  id: string;
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  name: string;
}

export const NavigationItem = ({ id, imageUrl, updatedAt, name }: NavigationItemProps) => {
  const params = useParams();
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);

  const normalizedImageUrl = useMemo(() => {
    const candidate = String(imageUrl ?? "").trim();
    if (!candidate) {
      return "";
    }
    // Avoid showing the global app logo for every server button.
    if (candidate === "/in-accord-steampunk-logo.png") {
      return "";
    }
    if (candidate.startsWith("/") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
    return "";
  }, [imageUrl]);

  const resolvedImageSrc = useMemo(() => {
    if (!normalizedImageUrl) {
      return "";
    }

    const updatedAtKey = updatedAt ? new Date(updatedAt).getTime() : 0;
    const cacheKey = `${id}-${Number.isFinite(updatedAtKey) ? updatedAtKey : 0}`;
    const joiner = normalizedImageUrl.includes("?") ? "&" : "?";

    return `${normalizedImageUrl}${joiner}sv=${encodeURIComponent(cacheKey)}`;
  }, [normalizedImageUrl, id, updatedAt]);

  const initials = (name?.trim()?.[0] ?? "S").toUpperCase();
  const showImage = !!resolvedImageSrc && !imageFailed;

  const onClick = () => {
    router.push(`/servers/${id}`);
  };

  return (
    <ActionTooltip side="right" align="center" label={name}>
      <button
        onClick={onClick}
        className="group relative flex items-center shadow-none ring-0 outline-none border-0 bg-transparent"
        style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none" }}
      >
        <div
          className={cn(
            "absolute left-0 bg-primary rounded-r-full transition-all w-[4px]",
            params?.serverId !== id && "group-hover:h-[20px]",
            params?.serverId === id ? "h-[36px]" : "h-[8px]"
          )}
        />
        <div
          className={cn(
            "relative group flex mx-3 h-[48px] w-[48px] rounded-[24px] group-hover:rounded-[16px] transition-all overflow-hidden",
            params?.serverId === id && "bg-primary/10 text-primary rounded-[16px]"
          )}
        >
          {showImage ? (
            <img
              src={resolvedImageSrc}
              alt={name}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="h-full w-full bg-zinc-700 text-white flex items-center justify-center text-sm font-bold">
              {initials}
            </div>
          )}
        </div>
      </button>
    </ActionTooltip>
  );
};
