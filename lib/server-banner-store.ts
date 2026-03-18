import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureLegacyServerBannerPointersImported } from "@/lib/legacy-banner-db-migration";

export type BannerFitMode = "cover" | "contain" | "scale";

export interface ServerBannerConfig {
  url: string;
  fit: BannerFitMode;
  scale: number;
}

declare global {
  // eslint-disable-next-line no-var
  var inAccordServerBannerSchemaReady: boolean | undefined;
}

const ensureServerBannerSchema = async () => {
  if (globalThis.inAccordServerBannerSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerBanner" (
      "serverId" varchar(191) primary key,
      "url" text,
      "fit" varchar(20) not null default 'cover',
      "scale" double precision not null default 1,
      "createdAt" timestamp not null default now(),
      "updatedAt" timestamp not null default now()
    )
  `);

  await db.execute(sql`
    alter table "ServerBanner"
    add column if not exists "url" text
  `);

  await db.execute(sql`
    alter table "ServerBanner"
    add column if not exists "fit" varchar(20) not null default 'cover'
  `);

  await db.execute(sql`
    alter table "ServerBanner"
    add column if not exists "scale" double precision not null default 1
  `);

  await db.execute(sql`
    alter table "ServerBanner"
    add column if not exists "createdAt" timestamp not null default now()
  `);

  await db.execute(sql`
    alter table "ServerBanner"
    add column if not exists "updatedAt" timestamp not null default now()
  `);

  await ensureLegacyServerBannerPointersImported();
  globalThis.inAccordServerBannerSchemaReady = true;
};

const normalizeScale = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }
  return Math.min(2, Math.max(0.25, value));
};

const normalizeFit = (value?: string): BannerFitMode => {
  if (value === "contain" || value === "scale") {
    return value;
  }
  return "cover";
};

export async function getServerBannerConfig(serverId: string): Promise<ServerBannerConfig | null> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return null;
  }

  await ensureServerBannerSchema();

  const result = await db.execute(sql`
    select
      nullif(trim(sb."url"), '') as "url",
      sb."fit" as "fit",
      sb."scale" as "scale"
    from "ServerBanner" sb
    where sb."serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = ((result as unknown as {
    rows?: Array<{ url: string | null; fit: string | null; scale: number | string | null }>;
  }).rows ?? [])[0];

  const trimmed = typeof row?.url === "string" ? row.url.trim() : "";
  if (!trimmed) {
    return null;
  }

  return {
    url: trimmed,
    fit: normalizeFit(row?.fit ?? undefined),
    scale: normalizeScale(typeof row?.scale === "number" ? row.scale : Number(row?.scale)),
  };
}

export async function getServerBanner(serverId: string): Promise<string | null> {
  const config = await getServerBannerConfig(serverId);
  return config?.url ?? null;
}

export async function setServerBanner(serverId: string, bannerUrl?: string | null) {
  await setServerBannerConfig(serverId, {
    url: bannerUrl ?? "",
    fit: "cover",
    scale: 1,
  });
}

export async function setServerBannerConfig(
  serverId: string,
  config?: { url?: string | null; fit?: BannerFitMode | string; scale?: number }
) {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    throw new Error("Server ID is required.");
  }

  await ensureServerBannerSchema();

  const url = typeof config?.url === "string" ? config.url.trim() : "";
  const fit = normalizeFit(config?.fit);
  const scale = normalizeScale(config?.scale);
  const now = new Date();

  if (url.length > 0) {
    await db.execute(sql`
      insert into "ServerBanner" ("serverId", "url", "fit", "scale", "createdAt", "updatedAt")
      values (${normalizedServerId}, ${url}, ${fit}, ${scale}, ${now}, ${now})
      on conflict ("serverId") do update
      set "url" = excluded."url",
          "fit" = excluded."fit",
          "scale" = excluded."scale",
          "updatedAt" = excluded."updatedAt"
    `);
  } else {
    await db.execute(sql`
      delete from "ServerBanner"
      where "serverId" = ${normalizedServerId}
    `);
  }
}
