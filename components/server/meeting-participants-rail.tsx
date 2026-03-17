"use client";

import { Activity, Headphones, Mic, ScreenShare, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { getStreamBadgeText, getStreamTooltipText } from "@/lib/streaming-display";

type ConnectedMeetingMember = {
  memberId: string;
  profileId: string;
  displayName: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isStreaming: boolean;
  streamLabel?: string | null;
};

type MemberDetails = {
  displayName: string;
  profileImageUrl: string;
};

type MeetingParticipantsRailProps = {
  serverId: string;
  channelId: string;
  currentProfileId: string;
  initialMembers: ConnectedMeetingMember[];
  memberDetailsByProfileId: Record<string, MemberDetails>;
};

export const MeetingParticipantsRail = ({
  serverId,
  channelId,
  currentProfileId,
  initialMembers,
  memberDetailsByProfileId,
}: MeetingParticipantsRailProps) => {
  const [members, setMembers] = useState<ConnectedMeetingMember[]>(initialMembers);

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const endpoint = `/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`;

    const refreshMembers = async () => {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => null);
        const nextMembersRaw = Array.isArray(payload?.connectedMembers) ? payload.connectedMembers : [];

        const nextMembers: ConnectedMeetingMember[] = nextMembersRaw.map((member: any) => ({
          memberId: String(member?.memberId ?? ""),
          profileId: String(member?.profileId ?? ""),
          displayName: String(member?.displayName ?? "Unknown user"),
          isSpeaking: Boolean(member?.isSpeaking),
          isMuted: Boolean(member?.isMuted),
          isDeafened: Boolean(member?.isDeafened),
          isCameraOn: Boolean(member?.isCameraOn),
          isStreaming: Boolean(member?.isStreaming),
          streamLabel:
            typeof member?.streamLabel === "string" && member.streamLabel.trim().length
              ? member.streamLabel.trim()
              : null,
        }));

        if (!cancelled) {
          setMembers(nextMembers);
        }
      } catch {
        // no-op
      }
    };

    void refreshMembers();
    const timer = window.setInterval(refreshMembers, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channelId, serverId]);

  return (
    <aside className="min-h-0 rounded-[22px] border border-border/80 bg-background/45 p-3 shadow-lg shadow-black/25">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Meeting participants
      </p>

      {members.length ? (
        <div className="rounded-xl border border-border/70 bg-background/70 p-2">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Participant strip
          </p>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {members.map((item) => {
              const details = memberDetailsByProfileId[item.profileId];
              const resolvedDisplayName = item.profileId === currentProfileId
                ? "You"
                : details?.displayName ?? item.displayName;

              return (
                <div
                  key={item.memberId}
                  className="w-full rounded-lg border border-border/50 bg-background/80 px-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      src={details?.profileImageUrl}
                      className="h-8 w-8 md:h-8 md:w-8"
                    />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {resolvedDisplayName}
                      </p>
                      {item.isStreaming ? (
                        <span className="inline-flex items-center rounded-full border border-indigo-300/50 bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-100">
                          Live
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.isSpeaking
                          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                          : "border-rose-400/60 bg-rose-500/20 text-rose-300"
                      }`}
                      title={item.isSpeaking ? "Speaking" : "Idle"}
                    >
                      <Activity className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.isMuted
                          ? "border-rose-400/60 bg-rose-500/20 text-rose-300"
                          : "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                      }`}
                      title={item.isMuted ? "Mic Off" : "Mic On"}
                    >
                      <Mic className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.isDeafened
                          ? "border-rose-400/60 bg-rose-500/20 text-rose-300"
                          : "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                      }`}
                      title={item.isDeafened ? "Audio Off" : "Audio On"}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.isCameraOn
                          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                          : "border-rose-400/60 bg-rose-500/20 text-rose-300"
                      }`}
                      title={item.isCameraOn ? "Camera On" : "Camera Off"}
                    >
                      <Video className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.isStreaming
                          ? "border-indigo-300/60 bg-indigo-500/20 text-indigo-100"
                          : "border-zinc-500/60 bg-zinc-700/30 text-zinc-300"
                      }`}
                      title={
                        item.isStreaming
                          ? getStreamTooltipText(item.streamLabel)
                          : "Not streaming"
                      }
                    >
                      <ScreenShare className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  {item.isStreaming ? (
                    <div className="mt-1">
                      <span className="group relative inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/45 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-100">
                        <ScreenShare className="h-3 w-3 shrink-0" />
                        <span className="max-w-44 truncate">
                          {getStreamBadgeText(item.streamLabel)}
                        </span>
                        {item.streamLabel ? (
                          <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden max-w-56 rounded-md border border-indigo-300/45 bg-[#151a2a] px-2 py-1 text-[10px] text-indigo-50 shadow-lg group-hover:block group-focus-within:block">
                            {item.streamLabel}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No one connected yet.</p>
      )}
    </aside>
  );
};
