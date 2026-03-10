"use client";

import { Activity, Headphones, Mic, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/user-avatar";

type ConnectedMeetingMember = {
  memberId: string;
  profileId: string;
  displayName: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
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
                    <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {resolvedDisplayName}
                    </p>
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
                  </div>
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
