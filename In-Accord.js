/*
 * In-Accord.js
 * Lightweight JavaScript SDK for In-Accord APIs.
 */

class InAccord {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "http://localhost:3000").replace(/\/$/, "");
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    this.credentials = options.credentials || "include";
  }

  setHeader(name, value) {
    this.defaultHeaders[name] = value;
    return this;
  }

  setBearerToken(token) {
    if (token) {
      this.defaultHeaders.Authorization = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders.Authorization;
    }
    return this;
  }

  async request(path, { method = "GET", query, body, headers } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        ...this.defaultHeaders,
        ...(headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: this.credentials,
      cache: "no-store",
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message = typeof data === "string" ? data : data?.error || data?.message || "Request failed";
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  // Auth
  signIn({ email, password }) {
    return this.request("/api/auth/sign-in", {
      method: "POST",
      body: { email, password },
    });
  }

  signUp({ name, email, password, phoneNumber, dateOfBirth }) {
    return this.request("/api/auth/sign-up", {
      method: "POST",
      body: { name, email, password, phoneNumber, dateOfBirth },
    });
  }

  logout() {
    return this.request("/api/auth/logout", { method: "POST" });
  }

  // Profile
  getPreferences() {
    return this.request("/api/profile/preferences");
  }

  updatePreferences(updates) {
    return this.request("/api/profile/preferences", {
      method: "PATCH",
      body: updates,
    });
  }

  // Servers
  createServer(payload) {
    return this.request("/api/servers", {
      method: "POST",
      body: payload,
    });
  }

  searchServers(query) {
    return this.request("/api/servers/search", { query: { query } });
  }

  joinServer(serverId) {
    return this.request("/api/servers/join", {
      method: "POST",
      body: { serverId },
    });
  }

  updateServer(serverId, payload) {
    return this.request(`/api/servers/${encodeURIComponent(serverId)}`, {
      method: "PATCH",
      body: payload,
    });
  }

  deleteServer(serverId) {
    return this.request(`/api/servers/${encodeURIComponent(serverId)}`, {
      method: "DELETE",
    });
  }

  listServerMembers(serverId) {
    return this.request(`/api/servers/${encodeURIComponent(serverId)}/members`);
  }

  // Channels
  createChannel(payload) {
    return this.request("/api/channels", {
      method: "POST",
      body: payload,
    });
  }

  updateChannel(channelId, payload) {
    return this.request(`/api/channels/${encodeURIComponent(channelId)}`, {
      method: "PATCH",
      query: { serverId: payload?.serverId },
      body: payload,
    });
  }

  deleteChannel(channelId, serverId) {
    return this.request(`/api/channels/${encodeURIComponent(channelId)}`, {
      method: "DELETE",
      query: { serverId },
    });
  }

  // Messages
  sendMessage({ serverId, channelId, content, fileUrl, threadId }) {
    return this.request("/api/socket/messages", {
      method: "POST",
      query: { serverId, channelId, threadId },
      body: { content, fileUrl },
    });
  }

  editMessage({ serverId, channelId, messageId, content }) {
    return this.request(`/api/socket/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      query: { serverId, channelId },
      body: { content },
    });
  }

  deleteMessage({ serverId, channelId, messageId }) {
    return this.request(`/api/socket/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      query: { serverId, channelId },
    });
  }

  bulkDeleteMessages({ serverId, channelId, amount, threadId }) {
    return this.request("/api/socket/messages/bulk-delete", {
      method: "POST",
      query: { serverId, channelId, threadId },
      body: { amount },
    });
  }

  // Voice state
  joinVoice({ serverId, channelId, isMuted = false, isDeafened = false, isCameraOn = false, isSpeaking = false }) {
    return this.request(`/api/channels/${encodeURIComponent(channelId)}/voice-state`, {
      method: "POST",
      query: { serverId },
      body: { isMuted, isDeafened, isCameraOn, isSpeaking },
    });
  }

  leaveVoice({ serverId, channelId }) {
    return this.request(`/api/channels/${encodeURIComponent(channelId)}/voice-state`, {
      method: "DELETE",
      query: { serverId },
    });
  }

  getVoiceState({ serverId, channelId }) {
    return this.request(`/api/channels/${encodeURIComponent(channelId)}/voice-state`, {
      query: { serverId },
    });
  }
}

// CommonJS export
module.exports = {
  InAccord,
  createInAccordClient: (options) => new InAccord(options),
};

// ESM-compatible named/default exports when transpiled/bundled
module.exports.default = InAccord;
