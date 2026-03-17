import { buildChannelRoom, joinRealtimeRooms, leaveRealtimeRooms } from "@/lib/realtime-server";
import { publishRealtimeEvent } from "@/lib/realtime-events-server";
import { listActiveVoiceMembersForChannel } from "@/lib/voice-states";

export const WEBRTC_SIGNAL_EVENT = "inaccord:webrtc-signal";
export const WEBRTC_PEER_EVENT = "inaccord:webrtc-peer";
export const WEBRTC_PEER_SNAPSHOT_EVENT = "inaccord:webrtc-peer-snapshot";

const normalizeId = (value: unknown) => String(value ?? "").trim();

const buildMeetingSocketKey = (serverId: string, channelId: string, profileId: string) => {
  if (!serverId || !channelId || !profileId) {
    return "";
  }

  return `${serverId}:${channelId}:${profileId}`;
};

const getSocketMeetingRefs = (socket: any) => {
  if (!socket.data) {
    socket.data = {};
  }

  if (!socket.data.inAccordMeetingRefs) {
    socket.data.inAccordMeetingRefs = {};
  }

  return socket.data.inAccordMeetingRefs as Record<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordSocketConnectionHandler:
    | ((socket: any) => void)
    | undefined;
}

export const registerSocketHandlers = (io: any) => {
  const previousHandler = globalThis.inAccordSocketConnectionHandler;
  if (previousHandler) {
    io.off("connection", previousHandler);
  }

  const attachHandlersToSocket = (socket: any) => {
    socket.removeAllListeners?.("inaccord:join");
    socket.removeAllListeners?.("inaccord:leave");
    socket.removeAllListeners?.(WEBRTC_SIGNAL_EVENT);

    socket.on("inaccord:join", async (payload: Record<string, unknown> | undefined) => {
      const normalizedPayload = payload ?? {};
      const serverId = normalizeId(normalizedPayload.serverId);
      const channelId = normalizeId(normalizedPayload.channelId);
      const profileId = normalizeId(normalizedPayload.profileId);
      const isMeetingPayload = normalizedPayload.meeting === true;
      const channelRoom = buildChannelRoom(serverId, channelId);
      const meetingSocketKey = buildMeetingSocketKey(serverId, channelId, profileId);
      const meetingRefs = getSocketMeetingRefs(socket);

      await joinRealtimeRooms(socket, normalizedPayload);

      if (!isMeetingPayload || !serverId || !channelId || !profileId || !channelRoom || !meetingSocketKey) {
        return;
      }

      const nextMeetingRefCount = Number(meetingRefs[meetingSocketKey] ?? 0) + 1;
      meetingRefs[meetingSocketKey] = nextMeetingRefCount;

      if (nextMeetingRefCount !== 1) {
        return;
      }

      await publishRealtimeEvent(
        WEBRTC_PEER_EVENT,
        { serverId, channelId, meeting: true },
        {
          serverId,
          channelId,
          profileId,
          state: "join",
        }
      );

      try {
        const activeMembers = await listActiveVoiceMembersForChannel({ serverId, channelId });
        const profileIds = activeMembers
          .map((member) => normalizeId(member.profileId))
          .filter((activeProfileId) => activeProfileId && activeProfileId !== profileId);

        socket.emit?.(WEBRTC_PEER_SNAPSHOT_EVENT, {
          serverId,
          channelId,
          profileIds,
        });
      } catch (error) {
        console.error("[WEBRTC_PEER_SNAPSHOT]", error);
      }
    });

    socket.on("inaccord:leave", async (payload: Record<string, unknown> | undefined) => {
      const normalizedPayload = payload ?? {};
      const serverId = normalizeId(normalizedPayload.serverId);
      const channelId = normalizeId(normalizedPayload.channelId);
      const profileId = normalizeId(normalizedPayload.profileId);
      const isMeetingPayload = normalizedPayload.meeting === true;
      const channelRoom = buildChannelRoom(serverId, channelId);
      const meetingSocketKey = buildMeetingSocketKey(serverId, channelId, profileId);
      const meetingRefs = getSocketMeetingRefs(socket);

      await leaveRealtimeRooms(socket, normalizedPayload);

      if (!isMeetingPayload || !serverId || !channelId || !profileId || !channelRoom || !meetingSocketKey) {
        return;
      }

      const currentMeetingRefCount = Number(meetingRefs[meetingSocketKey] ?? 0);
      if (currentMeetingRefCount <= 1) {
        delete meetingRefs[meetingSocketKey];
      } else {
        meetingRefs[meetingSocketKey] = currentMeetingRefCount - 1;
        return;
      }

      if (currentMeetingRefCount <= 0) {
        return;
      }

      await publishRealtimeEvent(
        WEBRTC_PEER_EVENT,
        { serverId, channelId, meeting: true },
        {
          serverId,
          channelId,
          profileId,
          state: "leave",
        }
      );
    });

    socket.on(WEBRTC_SIGNAL_EVENT, async (payload: Record<string, unknown> | undefined) => {
      const senderProfileId = normalizeId(payload?.senderProfileId);
      const targetProfileId = normalizeId(payload?.targetProfileId);
      const serverId = normalizeId(payload?.serverId);
      const channelId = normalizeId(payload?.channelId);
      const signal = payload?.signal;

      if (!senderProfileId || !targetProfileId || !serverId || !channelId || !signal || typeof signal !== "object") {
        console.warn("[WEBRTC_SIGNAL_VALIDATION_FAILED]", {
          senderProfileId: senderProfileId || "EMPTY",
          targetProfileId: targetProfileId || "EMPTY",
          serverId: serverId || "EMPTY",
          channelId: channelId || "EMPTY",
          hasSignal: Boolean(signal),
          signalType: typeof signal,
        });
        return;
      }

      await publishRealtimeEvent(
        WEBRTC_SIGNAL_EVENT,
        { profileId: targetProfileId, meeting: true },
        {
          senderProfileId,
          targetProfileId,
          serverId,
          channelId,
          signal,
        }
      );
    });
  };

  const connectionHandler = (socket: any) => {
    attachHandlersToSocket(socket);
  };

  globalThis.inAccordSocketConnectionHandler = connectionHandler;
  io.on("connection", connectionHandler);

  const activeSockets = io?.sockets?.sockets;
  if (activeSockets && typeof activeSockets.forEach === "function") {
    activeSockets.forEach((socket: any) => {
      attachHandlersToSocket(socket);
    });
  }
};
