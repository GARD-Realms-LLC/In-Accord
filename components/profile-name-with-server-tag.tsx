"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { cn } from "@/lib/utils";

type SelectedServerTag = {
  serverId: string;
  serverName: string;
  tagCode: string;
  iconKey: string;
  iconEmoji: string;
};

type ProfileCardPayload = {
  selectedServerTag?: SelectedServerTag | null;
};

type ProfileNameWithServerTagProps = {
  name: string;
  profileId?: string | null;
  memberId?: string | null;
  containerClassName?: string;
  nameClassName?: string;
  badgeClassName?: string;
};

const tagCache = new Map<string, SelectedServerTag | null>();
const inflightRequests = new Map<string, Promise<SelectedServerTag | null>>();

const getCacheKey = (profileId: string, memberId?: string | null) => `${profileId}::${memberId ?? ""}`;

const readTag = async (profileId: string, memberId?: string | null) => {
  const cacheKey = getCacheKey(profileId, memberId);

  if (tagCache.has(cacheKey)) {
    return tagCache.get(cacheKey) ?? null;
  }

  const existingRequest = inflightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = axios
    .get<ProfileCardPayload>(`/api/profile/${encodeURIComponent(profileId)}/card`, {
      params: memberId ? { memberId } : undefined,
    })
    .then((response) => {
      const tag = response.data?.selectedServerTag;
      const normalized = tag && typeof tag.tagCode === "string" ? tag : null;
      tagCache.set(cacheKey, normalized);
      return normalized;
    })
    .catch(() => {
      tagCache.set(cacheKey, null);
      return null;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
};

export const ProfileNameWithServerTag = ({
  name,
  profileId,
  memberId,
  containerClassName,
  nameClassName,
  badgeClassName,
}: ProfileNameWithServerTagProps) => {
  const [selectedServerTag, setSelectedServerTag] = useState<SelectedServerTag | null>(null);

  const trimmedProfileId = useMemo(() => String(profileId ?? "").trim(), [profileId]);
  const trimmedMemberId = useMemo(() => String(memberId ?? "").trim(), [memberId]);

  useEffect(() => {
    if (!trimmedProfileId) {
      setSelectedServerTag(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const tag = await readTag(trimmedProfileId, trimmedMemberId || null);
      if (!cancelled) {
        setSelectedServerTag(tag);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [trimmedMemberId, trimmedProfileId]);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", containerClassName)}>
      <span className={cn("truncate", nameClassName)}>{name}</span>
      {selectedServerTag ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]",
            badgeClassName
          )}
          title={`Server tag from ${selectedServerTag.serverName}`}
        >
          <span>{selectedServerTag.iconEmoji}</span>
          <span>{selectedServerTag.tagCode}</span>
        </span>
      ) : null}
    </span>
  );
};
