/*
 * In-Accord.js
 * Lightweight JavaScript SDK for In-Accord APIs.
 */

const { EventEmitter } = require("node:events");

const decodeCharCodes = (codes) => codes.map((value) => String.fromCharCode(value)).join("");

const DEFAULT_COMPAT_API_ORIGIN = `${decodeCharCodes([104, 116, 116, 112, 115])}://${decodeCharCodes([100, 105, 115, 99, 111, 114, 100, 46, 99, 111, 109])}`;

const GatewayIntentBits = Object.freeze({
  Guilds: 1,
  GuildMembers: 2,
});

const resolveCompatApiOrigin = () => {
  const configured = [
    process.env.IN_ACCORD_COMPAT_API_ORIGIN,
    process.env.IN_ACCORD_GATEWAY_API_ORIGIN,
    process.env.IN_ACCORD_API_BASE_URL,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return (configured || DEFAULT_COMPAT_API_ORIGIN).replace(/\/$/, "");
};

const createCompatibilityAuthorizationHeader = (token) => `Bot ${String(token ?? "").trim()}`;

const normalizeOptionalString = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const withQuery = (path, query) => {
  if (!query || typeof query !== "object") {
    return path;
  }

  const url = new URL(path, "https://placeholder.local");
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
};

const getFetchImplementation = () => {
  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }

  throw new Error("Global fetch is unavailable in this runtime.");
};

const buildCompatTag = (user) => {
  const username = String(user?.username ?? "").trim();
  const discriminator = String(user?.discriminator ?? "").trim();

  if (!username) {
    return null;
  }

  if (discriminator && discriminator !== "0") {
    return `${username}#${discriminator}`;
  }

  return username;
};

const normalizeCompatUser = (user) => {
  if (!user || typeof user !== "object") {
    return null;
  }

  const id = String(user.id ?? "").trim();
  const username = String(user.username ?? user.global_name ?? "").trim();
  const tag = buildCompatTag(user) || username || null;

  if (!id && !username && !tag) {
    return null;
  }

  return {
    id: id || null,
    username: username || tag || null,
    tag,
  };
};

const normalizeCompatGuild = (guild) => {
  if (!guild || typeof guild !== "object") {
    return null;
  }

  const id = String(guild.id ?? "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: String(guild.name ?? "").trim() || null,
    icon: guild.icon ?? null,
    owner: Boolean(guild.owner),
    permissions: guild.permissions ?? null,
    features: Array.isArray(guild.features) ? [...guild.features] : [],
  };
};

class Collection extends Map {
  first() {
    for (const value of this.values()) {
      return value;
    }

    return undefined;
  }

  last() {
    let value;
    for (value of this.values()) {
      // walk to end
    }
    return value;
  }

  find(predicate, thisArg) {
    for (const [key, value] of this.entries()) {
      if (predicate.call(thisArg, value, key, this)) {
        return value;
      }
    }

    return undefined;
  }

  filter(predicate, thisArg) {
    const filtered = new Collection();
    for (const [key, value] of this.entries()) {
      if (predicate.call(thisArg, value, key, this)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  }

  map(mapper, thisArg) {
    const values = [];
    for (const [key, value] of this.entries()) {
      values.push(mapper.call(thisArg, value, key, this));
    }
    return values;
  }

  some(predicate, thisArg) {
    for (const [key, value] of this.entries()) {
      if (predicate.call(thisArg, value, key, this)) {
        return true;
      }
    }
    return false;
  }

  every(predicate, thisArg) {
    for (const [key, value] of this.entries()) {
      if (!predicate.call(thisArg, value, key, this)) {
        return false;
      }
    }
    return true;
  }

  sweep(predicate, thisArg) {
    let removed = 0;
    for (const [key, value] of this.entries()) {
      if (predicate.call(thisArg, value, key, this)) {
        this.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clone() {
    return new Collection(this);
  }

  toJSON() {
    return Array.from(this.values());
  }
}

class BaseManager {
  constructor(client) {
    this.client = client;
    this.cache = new Collection();
  }

  _setCache(entries) {
    this.cache.clear();
    for (const entry of entries) {
      if (entry?.id) {
        this.cache.set(entry.id, entry);
      }
    }
    return this.cache;
  }

  _upsert(entry) {
    if (entry?.id) {
      this.cache.set(entry.id, entry);
    }
    return entry;
  }
}

class CompatUserManager extends BaseManager {
  async fetch(id = "@me") {
    const user = await this.client.apiGet(`/api/v10/users/${encodeURIComponent(id)}`);
    const normalizedUser = normalizeCompatUser(user);
    if (!normalizedUser) {
      throw new Error("Compat API did not return a valid user payload.");
    }
    return this._upsert(normalizedUser);
  }
}

class CompatGuildManager extends BaseManager {
  async fetch(target) {
    if (typeof target === "string" && target.trim()) {
      const guild = await this.client.apiGet(`/api/v10/guilds/${encodeURIComponent(target.trim())}`);
      const normalizedGuild = normalizeCompatGuild(guild);
      if (!normalizedGuild) {
        throw new Error("Compat API did not return a valid server payload.");
      }
      return this._upsert(normalizedGuild);
    }

    const query = typeof target === "object" && target ? target : {};
    const payload = await this.client.apiGet(withQuery("/api/v10/users/@me/guilds", {
      limit: query.limit ?? 200,
      before: query.before,
      after: query.after,
    }));

    const guilds = Array.isArray(payload)
      ? payload.map((entry) => normalizeCompatGuild(entry)).filter(Boolean)
      : [];

    this._setCache(guilds);
    return this.cache;
  }
}

class CompatChannelManager {
  constructor(client) {
    this.client = client;
  }

  async fetchForGuild(guildId) {
    const payload = await this.client.apiGet(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}/channels`);
    return Array.isArray(payload) ? payload : [];
  }
}

class CompatRoleManager {
  constructor(client) {
    this.client = client;
  }

  async fetchForGuild(guildId) {
    const payload = await this.client.apiGet(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}/roles`);
    return Array.isArray(payload) ? payload : [];
  }
}

class CompatInviteManager {
  constructor(client) {
    this.client = client;
  }

  async fetch(code, options = {}) {
    const normalizedCode = String(code ?? "").trim();
    if (!normalizedCode) {
      throw new Error("Invite code is required.");
    }

    return this.client.apiGet(withQuery(`/api/v10/invites/${encodeURIComponent(normalizedCode)}`, options));
  }
}

class CompatApplicationCommandManager {
  constructor(client) {
    this.client = client;
  }

  async fetch(applicationId) {
    const normalizedApplicationId = String(applicationId ?? this.client.application?.id ?? "").trim();
    if (!normalizedApplicationId) {
      throw new Error("Application id is required.");
    }

    const payload = await this.client.apiGet(`/api/v10/applications/${encodeURIComponent(normalizedApplicationId)}/commands`);
    return Array.isArray(payload) ? payload : [];
  }
}

class InAccordCompatClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...options };
    this.intents = Array.isArray(options.intents) ? [...options.intents] : [];
    this.restOrigin = resolveCompatApiOrigin();
    this.user = null;
    this.users = new CompatUserManager(this);
    this.guilds = new CompatGuildManager(this);
    this.channels = new CompatChannelManager(this);
    this.roles = new CompatRoleManager(this);
    this.invites = new CompatInviteManager(this);
    this.application = {
      id: normalizeOptionalString(options.applicationId),
      commands: new CompatApplicationCommandManager(this),
    };
    this.token = null;
    this.readyAt = null;
    this.destroyed = false;
  }

  get readyTimestamp() {
    return this.readyAt ? this.readyAt.getTime() : null;
  }

  isReady() {
    return !this.destroyed && Boolean(this.readyAt && this.user);
  }

  async apiGet(path, { query } = {}) {
    return this.#request(path, this.#requireToken(), { query });
  }

  async login(token) {
    const normalizedToken = String(token ?? "").trim();
    if (!normalizedToken) {
      const error = new Error("Token is required.");
      queueMicrotask(() => {
        this.emit("error", error);
      });
      throw error;
    }

    this.destroyed = false;

    try {
      const [user, guilds] = await Promise.all([
        this.#fetchCurrentUser(normalizedToken),
        this.#fetchCurrentGuilds(normalizedToken),
      ]);

      this.token = normalizedToken;
      this.user = user;
      this.users._upsert(user);
      this.guilds._setCache(guilds);
      this.readyAt = new Date();

      queueMicrotask(() => {
        if (!this.destroyed) {
          this.emit("ready");
        }
      });

      return normalizedToken;
    } catch (error) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      queueMicrotask(() => {
        this.emit("error", wrappedError);
      });
      throw wrappedError;
    }
  }

  destroy() {
    const wasActive = !this.destroyed && Boolean(this.token || this.user || this.guilds.cache.size > 0);

    this.destroyed = true;
    this.readyAt = null;
    this.token = null;
    this.user = null;
    this.users.cache.clear();
    this.guilds.cache.clear();

    if (wasActive) {
      queueMicrotask(() => {
        this.emit("shardDisconnect");
      });
    }
  }

  async #request(path, token, { query } = {}) {
    const fetchImpl = getFetchImplementation();
    const url = new URL(`${this.restOrigin}${path}`);

    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: createCompatibilityAuthorizationHeader(token),
        "Content-Type": "application/json",
      },
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
      const message = typeof data === "string" ? data : data?.message || data?.error || `Compat API request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  #requireToken() {
    const normalizedToken = String(this.token ?? "").trim();
    if (!normalizedToken) {
      throw new Error("Client is not logged in.");
    }
    return normalizedToken;
  }

  async #fetchCurrentUser(token) {
    const user = await this.#request("/api/v10/users/@me", token);
    const normalizedUser = normalizeCompatUser(user);

    if (!normalizedUser) {
      throw new Error("Compat API did not return a valid bot user payload.");
    }

    return normalizedUser;
  }

  async #fetchCurrentGuilds(token) {
    const guilds = [];
    let after = null;
    let pageCount = 0;

    while (pageCount < 25) {
      const payload = await this.#request("/api/v10/users/@me/guilds", token, {
        query: {
          limit: 200,
          ...(after ? { after } : {}),
        },
      });

      if (!Array.isArray(payload) || payload.length === 0) {
        break;
      }

      const normalizedBatch = payload.map((guild) => normalizeCompatGuild(guild)).filter(Boolean);
      guilds.push(...normalizedBatch);

      const lastId = String(payload[payload.length - 1]?.id ?? "").trim();
      pageCount += 1;

      if (payload.length < 200 || !lastId || lastId === after) {
        break;
      }

      after = lastId;
    }

    return guilds;
  }
}

class InAccord {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "http://localhost:3000").replace(/\/$/, "");
    this.compatApiOrigin = resolveCompatApiOrigin();
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

  setIntegrationToken(token) {
    if (token) {
      this.defaultHeaders.Authorization = createCompatibilityAuthorizationHeader(token);
    } else {
      delete this.defaultHeaders.Authorization;
    }
    return this;
  }

  setBotToken(token) {
    return this.setIntegrationToken(token);
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

  async compatRequest(path, { method = "GET", query, body, headers } = {}) {
    const url = new URL(`${this.compatApiOrigin}${path}`);

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
      const message = typeof data === "string" ? data : data?.error || data?.message || "Compat request failed";
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

  getCurrentUser() {
    return this.compatRequest("/api/v10/users/@me");
  }

  getCurrentServers({ limit = 200, before, after } = {}) {
    return this.compatRequest("/api/v10/users/@me/guilds", {
      query: { limit, before, after },
    });
  }

  getServer(guildId) {
    return this.compatRequest(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}`);
  }

  getServerRoles(guildId) {
    return this.compatRequest(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}/roles`);
  }

  getServerChannels(guildId) {
    return this.compatRequest(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}/channels`);
  }

  getWidget(guildId) {
    return this.compatRequest(`/api/v10/guilds/${encodeURIComponent(String(guildId ?? "").trim())}/widget.json`);
  }

  getInvite(code, options = {}) {
    return this.compatRequest(`/api/v10/invites/${encodeURIComponent(String(code ?? "").trim())}`, {
      query: options,
    });
  }

  getApplicationCommands(applicationId) {
    return this.compatRequest(`/api/v10/applications/${encodeURIComponent(String(applicationId ?? "").trim())}/commands`);
  }
}

// CommonJS export
module.exports = {
  InAccord,
  Collection,
  createInAccordClient: (options) => new InAccord(options),
  Client: InAccordCompatClient,
  GatewayIntentBits,
};

// ESM-compatible named/default exports when transpiled/bundled
module.exports.default = InAccord;
