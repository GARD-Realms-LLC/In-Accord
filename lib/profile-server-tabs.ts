import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ProfileServerTab = {
  serverId: string;
  serverName: string;
  defaultChannelId: string | null;
  lastVisitedAt: number;
};

export type ProfileTabBarPreferences = {
  tabMinWidth: number;
  tabMaxWidth: number;
  barRounded: boolean;
  activeTabColor: string;
  inactiveTabColor: string;
  compactMode: boolean;
  closeOnHover: boolean;
};

export type ProfileCustomTabPreset = {
  label: string;
  prefs: ProfileTabBarPreferences;
};

export type ProfileServerTabsState = {
  tabs: ProfileServerTab[];
  tabBarPreferences: ProfileTabBarPreferences;
  customTabPresets: Array<ProfileCustomTabPreset | null>;
};

const DEFAULT_TAB_BAR_PREFERENCES: ProfileTabBarPreferences = {
  tabMinWidth: 120,
  tabMaxWidth: 220,
  barRounded: true,
  activeTabColor: "#5865f2",
  inactiveTabColor: "#3f4248",
  compactMode: false,
  closeOnHover: false,
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-fA-F]{6})$/.test(value.trim());

const parseJsonSafely = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const normalizeProfileServerTabs = (input: unknown): ProfileServerTab[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Map<string, ProfileServerTab>();

  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Partial<ProfileServerTab> & { id?: string; name?: string };
    const id = String(row.serverId ?? row.id ?? "").trim();
    if (!id) {
      continue;
    }

    const serverName = String(row.serverName ?? row.name ?? "").trim().slice(0, 80) || "Server";
    const defaultChannelId =
      typeof row.defaultChannelId === "string" && row.defaultChannelId.trim().length > 0
        ? row.defaultChannelId.trim()
        : null;
    const lastVisitedAt =
      typeof row.lastVisitedAt === "number" && Number.isFinite(row.lastVisitedAt)
        ? row.lastVisitedAt
        : Date.now();

    const previous = deduped.get(id);
    if (!previous || lastVisitedAt >= previous.lastVisitedAt) {
      deduped.set(id, {
        serverId: id,
        serverName,
        defaultChannelId,
        lastVisitedAt,
      });
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => (a.lastVisitedAt ?? 0) - (b.lastVisitedAt ?? 0))
    .slice(-200);
};

export const normalizeProfileTabBarPreferences = (input: unknown): ProfileTabBarPreferences => {
  const row = input && typeof input === "object" ? (input as Partial<ProfileTabBarPreferences>) : {};

  const tabMinWidth =
    typeof row.tabMinWidth === "number" && Number.isFinite(row.tabMinWidth)
      ? Math.min(180, Math.max(90, Math.round(row.tabMinWidth)))
      : DEFAULT_TAB_BAR_PREFERENCES.tabMinWidth;

  const tabMaxWidth =
    typeof row.tabMaxWidth === "number" && Number.isFinite(row.tabMaxWidth)
      ? Math.min(320, Math.max(tabMinWidth + 20, Math.round(row.tabMaxWidth)))
      : DEFAULT_TAB_BAR_PREFERENCES.tabMaxWidth;

  return {
    tabMinWidth,
    tabMaxWidth,
    barRounded: row.barRounded !== false,
    activeTabColor: isHexColor(row.activeTabColor) ? row.activeTabColor.trim() : DEFAULT_TAB_BAR_PREFERENCES.activeTabColor,
    inactiveTabColor: isHexColor(row.inactiveTabColor)
      ? row.inactiveTabColor.trim()
      : DEFAULT_TAB_BAR_PREFERENCES.inactiveTabColor,
    compactMode: row.compactMode === true,
    closeOnHover: row.closeOnHover === true,
  };
};

export const normalizeProfileCustomTabPresets = (input: unknown): Array<ProfileCustomTabPreset | null> => {
  if (!Array.isArray(input)) {
    return [null, null];
  }

  const normalized = input.slice(0, 2).map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const row = entry as Partial<ProfileCustomTabPreset>;
    return {
      label:
        typeof row.label === "string" && row.label.trim().length > 0
          ? row.label.trim().slice(0, 28)
          : `Custom ${index + 1}`,
      prefs: normalizeProfileTabBarPreferences(row.prefs),
    } satisfies ProfileCustomTabPreset;
  });

  return [normalized[0] ?? null, normalized[1] ?? null];
};

let profileServerTabsSchemaReady = false;

export const ensureProfileServerTabsSchema = async () => {
  if (profileServerTabsSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ProfileServerTabs" (
      "profileId" varchar(191) primary key,
      "tabsJson" text not null default '[]',
      "tabBarPreferencesJson" text not null default '{}',
      "customTabPresetsJson" text not null default '[]',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ProfileServerTabs_updatedAt_idx"
    on "ProfileServerTabs" ("updatedAt")
  `);

  profileServerTabsSchemaReady = true;
};

export const getProfileServerTabsState = async (profileId: string): Promise<ProfileServerTabsState> => {
  await ensureProfileServerTabsSchema();

  const result = await db.execute(sql`
    select "tabsJson", "tabBarPreferencesJson", "customTabPresetsJson"
    from "ProfileServerTabs"
    where "profileId" = ${profileId}
    limit 1
  `);

  const row = (result as unknown as {
    rows: Array<{
      tabsJson: string | null;
      tabBarPreferencesJson: string | null;
      customTabPresetsJson: string | null;
    }>;
  }).rows?.[0];

  if (!row) {
    const now = new Date();
    await db.execute(sql`
      insert into "ProfileServerTabs" ("profileId", "tabsJson", "tabBarPreferencesJson", "customTabPresetsJson", "createdAt", "updatedAt")
      values (${profileId}, ${JSON.stringify([])}, ${JSON.stringify(DEFAULT_TAB_BAR_PREFERENCES)}, ${JSON.stringify([null, null])}, ${now}, ${now})
      on conflict ("profileId") do nothing
    `);

    return {
      tabs: [],
      tabBarPreferences: { ...DEFAULT_TAB_BAR_PREFERENCES },
      customTabPresets: [null, null],
    };
  }

  return {
    tabs: normalizeProfileServerTabs(parseJsonSafely(row.tabsJson)),
    tabBarPreferences: normalizeProfileTabBarPreferences(parseJsonSafely(row.tabBarPreferencesJson)),
    customTabPresets: normalizeProfileCustomTabPresets(parseJsonSafely(row.customTabPresetsJson)),
  };
};

export const updateProfileServerTabsState = async (
  profileId: string,
  updates: Partial<{
    tabs: unknown;
    tabBarPreferences: unknown;
    customTabPresets: unknown;
  }>
): Promise<ProfileServerTabsState> => {
  await ensureProfileServerTabsSchema();

  const values: Array<ReturnType<typeof sql>> = [];

  if (Object.prototype.hasOwnProperty.call(updates, "tabs")) {
    values.push(sql`"tabsJson" = ${JSON.stringify(normalizeProfileServerTabs(updates.tabs))}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "tabBarPreferences")) {
    values.push(
      sql`"tabBarPreferencesJson" = ${JSON.stringify(normalizeProfileTabBarPreferences(updates.tabBarPreferences))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "customTabPresets")) {
    values.push(sql`"customTabPresetsJson" = ${JSON.stringify(normalizeProfileCustomTabPresets(updates.customTabPresets))}`);
  }

  if (values.length === 0) {
    return getProfileServerTabsState(profileId);
  }

  values.push(sql`"updatedAt" = now()`);

  await db.execute(sql`
    insert into "ProfileServerTabs" ("profileId", "tabsJson", "tabBarPreferencesJson", "customTabPresetsJson", "createdAt", "updatedAt")
    values (${profileId}, ${JSON.stringify([])}, ${JSON.stringify(DEFAULT_TAB_BAR_PREFERENCES)}, ${JSON.stringify([null, null])}, now(), now())
    on conflict ("profileId") do update
    set ${sql.join(values, sql`, `)}
  `);

  return getProfileServerTabsState(profileId);
};

export const removeServerFromAllProfileServerTabs = async (serverId: string) => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return;
  }

  await ensureProfileServerTabsSchema();

  const result = await db.execute(sql`
    select "profileId", "tabsJson"
    from "ProfileServerTabs"
  `);

  const rows = (result as unknown as {
    rows: Array<{ profileId: string | null; tabsJson: string | null }>;
  }).rows ?? [];

  for (const row of rows) {
    const profileId = String(row.profileId ?? "").trim();
    if (!profileId) {
      continue;
    }

    const currentTabs = normalizeProfileServerTabs(parseJsonSafely(row.tabsJson));
    const nextTabs = currentTabs.filter((tab) => tab.serverId !== normalizedServerId);

    if (nextTabs.length === currentTabs.length) {
      continue;
    }

    await db.execute(sql`
      update "ProfileServerTabs"
      set "tabsJson" = ${JSON.stringify(nextTabs)},
          "updatedAt" = now()
      where "profileId" = ${profileId}
    `);
  }
};
