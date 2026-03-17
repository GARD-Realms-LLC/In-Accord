import { io } from "socket.io-client";

const url = process.env.DEBUG_SOCKET_URL || "http://127.0.0.1:3000";
const path = "/api/socket/io";
const serverId = `debug-server-${Date.now()}`;
const channelId = "debug-channel";
const profileA = "debug-a";
const profileB = "debug-b";

const a = io(url, {
  path,
  transports: ["polling", "websocket"],
  withCredentials: true,
});

const b = io(url, {
  path,
  transports: ["polling", "websocket"],
  withCredentials: true,
});

const log = (message, payload) => {
  if (typeof payload === "undefined") {
    console.log(message);
    return;
  }

  console.log(`${message} ${JSON.stringify(payload)}`);
};

const finish = (code) => {
  try {
    a.disconnect();
  } catch {}

  try {
    b.disconnect();
  } catch {}

  setTimeout(() => process.exit(code), 200);
};

let gotPeerJoinA = false;
let gotPeerJoinB = false;
let gotSignal = false;
let connected = 0;

const maybeJoin = () => {
  if (connected !== 2) {
    return;
  }

  setTimeout(() => {
    a.emit("inaccord:join", { serverId, channelId, profileId: profileA });
  }, 250);

  setTimeout(() => {
    b.emit("inaccord:join", { serverId, channelId, profileId: profileB });
  }, 1750);
};

const timer = setTimeout(() => {
  log("TIMEOUT", { gotPeerJoinA, gotPeerJoinB, gotSignal });
  finish(1);
}, 12000);

a.on("connect", () => {
  connected += 1;
  log("A_CONNECT", { connected });
  maybeJoin();
});

b.on("connect", () => {
  connected += 1;
  log("B_CONNECT", { connected });
  maybeJoin();
});

a.on("inaccord:webrtc-peer", (payload) => {
  log("A_PEER", payload);
  if (payload?.profileId === profileB && payload?.state === "join") {
    gotPeerJoinA = true;
    a.emit("inaccord:webrtc-signal", {
      senderProfileId: profileA,
      targetProfileId: profileB,
      serverId,
      channelId,
      signal: {
        description: {
          type: "offer",
          sdp: "fake-sdp",
        },
      },
    });
  }
});

b.on("inaccord:webrtc-peer", (payload) => {
  log("B_PEER", payload);
  if (payload?.profileId === profileA && payload?.state === "join") {
    gotPeerJoinB = true;
  }
});

b.on("inaccord:webrtc-signal", (payload) => {
  log("B_SIGNAL", payload);
  if (
    payload?.senderProfileId === profileA &&
    payload?.targetProfileId === profileB &&
    payload?.signal?.description?.type === "offer"
  ) {
    gotSignal = true;
    clearTimeout(timer);
    log("RESULT", { gotPeerJoinA, gotPeerJoinB, gotSignal });
    finish(0);
  }
});

a.on("connect_error", (error) => {
  log("A_CONNECT_ERROR", { message: error?.message ?? "unknown" });
});

b.on("connect_error", (error) => {
  log("B_CONNECT_ERROR", { message: error?.message ?? "unknown" });
});
