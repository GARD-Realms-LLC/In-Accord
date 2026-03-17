import { and, eq, sql } from "drizzle-orm";

import { db, member, server } from "@/lib/db";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import {
  OUR_BOARD_BUMP_COOLDOWN_MS,
  recordOurBoardBump,
  upsertOurBoardEntry,
} from "@/lib/our-board-store";
import { getChannelFeatureSettings } from "@/lib/channel-feature-settings";
import { getUserPreferences } from "@/lib/user-preferences";

export type SlashCommandDefinition = {
  name: string;
  description: string;
  sourceType: "BOT" | "APP" | "SYSTEM";
  sourceName: string;
  sourceId?: string;
  commandKey?: string;
  botSlug?: string;
  botConfigId?: string;
  responseMemberId?: string;
};

type BotMemberRow = {
  memberId: string;
  profileId: string;
};

const slugifyCommand = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const NON_IN_ACCORD_COMMAND_LIMIT = parsePositiveInt(
  process.env.SLASH_COMMAND_LIMIT_NON_IN_ACCORD,
  100
);

const IN_ACCORD_COMMAND_LIMIT = parsePositiveInt(
  process.env.SLASH_COMMAND_LIMIT_IN_ACCORD,
  200
);

const isInAccordIntegration = (value: string) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return normalized.includes("in-accord") || normalized.includes("in accord");
};

const getIntegrationCommandLimit = (sourceName: string) =>
  isInAccordIntegration(sourceName)
    ? IN_ACCORD_COMMAND_LIMIT
    : NON_IN_ACCORD_COMMAND_LIMIT;

const dedupeCommands = (items: SlashCommandDefinition[]) => {
  const seen = new Set<string>();
  const next: SlashCommandDefinition[] = [];

  for (const item of items) {
    if (!item.name || seen.has(item.name)) {
      continue;
    }

    seen.add(item.name);
    next.push(item);
  }

  return next;
};

export const listServerSlashCommands = async (
  serverId: string,
  options?: { channelId?: string | null }
): Promise<SlashCommandDefinition[]> => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return [];
  }

  const targetServer = await db.query.server.findFirst({
    where: eq(server.id, normalizedServerId),
  });

  if (!targetServer) {
    return [];
  }

  const normalizedChannelId = String(options?.channelId ?? "").trim();
  const channelSettings = normalizedChannelId
    ? await getChannelFeatureSettings({ serverId: normalizedServerId, channelId: normalizedChannelId })
    : null;
  const integrationsEnabled = channelSettings ? channelSettings.integrations.enabled : true;
  const allowedBotIds = new Set(
    channelSettings?.integrations.allowedBotIds.map((item) => String(item ?? "").trim()).filter(Boolean) ?? []
  );
  const allowedAppIds = new Set(
    channelSettings?.apps.allowedAppIds.map((item) => String(item ?? "").trim()).filter(Boolean) ?? []
  );
  const restrictBotIds = allowedBotIds.size > 0;
  const restrictAppIds = allowedAppIds.size > 0;

  const preferences = await getUserPreferences(targetServer.profileId);
  const enabledBots = preferences.OtherBots.filter((item) => item.enabled);
  const enabledApps = preferences.OtherApps.filter((item) => item.enabled);

  const botProfileIds = enabledBots.map((item) => makeIntegrationBotProfileId(targetServer.profileId, item.id));
  const botMemberMap = new Map<string, string>();

  if (botProfileIds.length > 0) {
    const result = await db.execute(sql`
      select "id" as "memberId", "profileId" as "profileId"
      from "Member"
      where "serverId" = ${normalizedServerId}
        and "profileId" in (${sql.join(botProfileIds.map((id) => sql`${id}`), sql`, `)})
    `);

    const rows = (result as unknown as { rows?: BotMemberRow[] }).rows ?? [];
    for (const row of rows) {
      botMemberMap.set(row.profileId, row.memberId);
    }
  }

  const commands: SlashCommandDefinition[] = [
    {
      name: "help",
      description: "Show available slash commands for this server.",
      sourceType: "SYSTEM",
      sourceName: "In-Accord",
    },
    {
      name: "integrations",
      description: "Show connected bots/apps for this server.",
      sourceType: "SYSTEM",
      sourceName: "In-Accord",
    },
    {
      name: "bump",
      description: "Bump this server on In-Aboard.",
      sourceType: "SYSTEM",
      sourceName: "In-Accord",
    },
  ];

  if (integrationsEnabled) {
    for (const bot of enabledBots) {
      const slug = slugifyCommand(bot.name) || "bot";
      const profileId = makeIntegrationBotProfileId(targetServer.profileId, bot.id);
      const responseMemberId = botMemberMap.get(profileId);
      const commandLimit = getIntegrationCommandLimit(bot.name);

      if (restrictBotIds && !allowedBotIds.has(bot.id)) {
        continue;
      }

      const botCommands = ((bot.commands ?? []).length > 0 ? bot.commands : ["help", "ping", "echo"])
        .slice(0, commandLimit);
      for (const commandKey of botCommands) {
        const normalizedKey = slugifyCommand(commandKey) || "command";
        commands.push({
          name: normalizedKey,
          description: `${bot.name}: /${normalizedKey}`,
          sourceType: "BOT",
          sourceName: bot.name,
          sourceId: bot.id,
          botSlug: slug,
          commandKey: normalizedKey,
          botConfigId: bot.id,
          responseMemberId,
        });

        commands.push({
          name: `${slug}-${normalizedKey}`,
          description: `${bot.name}: /${normalizedKey}`,
          sourceType: "BOT",
          sourceName: bot.name,
          sourceId: bot.id,
          botSlug: slug,
          commandKey: normalizedKey,
          botConfigId: bot.id,
          responseMemberId,
        });
      }
    }

    for (const app of enabledApps) {
      const slug = slugifyCommand(app.name) || "app";
      const commandLimit = getIntegrationCommandLimit(app.name);

      if (commandLimit <= 0) {
        continue;
      }

      if (restrictAppIds && !allowedAppIds.has(app.id)) {
        continue;
      }

      commands.push({
        name: `${slug}-about`,
        description: `Show info for ${app.name} app integration.`,
        sourceType: "APP",
        sourceName: app.name,
        sourceId: app.id,
      });
    }
  }

  return dedupeCommands(commands).slice(0, 1000);
};

export const executeServerSlashCommand = async ({
  serverId,
  rawInput,
  channelId,
  actorProfileId,
}: {
  serverId: string;
  rawInput: string;
  channelId: string;
  actorProfileId: string;
}): Promise<
  | { handled: false }
  | { handled: true; responseContent: string; responseMemberId?: string }
> => {
  const normalized = String(rawInput ?? "").trim();
  if (!normalized.startsWith("/")) {
    return { handled: false };
  }

  const withoutSlash = normalized.slice(1).trim();
  if (!withoutSlash) {
    return { handled: false };
  }

  const [commandNameRaw, ...argParts] = withoutSlash.split(/\s+/g);
  const commandName = commandNameRaw.trim().toLowerCase();

  const commands = await listServerSlashCommands(serverId, { channelId });
  let command = commands.find((item) => item.name === commandName);
  let args = argParts.join(" ").trim();

  // Support Other-style subcommand format, e.g. /my-bot ping
  // in addition to /my-bot-ping.
  if (!command && argParts.length > 0) {
    const sub = String(argParts[0] ?? "").trim().toLowerCase();
    if (sub) {
      const composite = `${commandName}-${sub}`;
      const mapped = commands.find((item) => item.name === composite);
      if (mapped) {
        command = mapped;
        args = argParts.slice(1).join(" ").trim();
      }
    }
  }

  // Fallback: /my-bot -> /my-bot-help when available.
  if (!command) {
    const helpAlias = `${commandName}-help`;
    const mapped = commands.find((item) => item.name === helpAlias);
    if (mapped) {
      command = mapped;
      args = argParts.join(" ").trim();
    }
  }

  if (!command) {
    return {
      handled: true,
      responseContent: `Unknown slash command: /${commandName}. Try /help for available commands.`,
    };
  }

  const selectedCommand = command;

  if (selectedCommand.name === "help") {
    const names = commands
      .map((item) => `/${item.name}`)
      .slice(0, 25)
      .join(", ");

    return {
      handled: true,
      responseContent: `Available commands: ${names}`,
    };
  }

  if (selectedCommand.name === "integrations") {
    const summary = commands
      .filter((item) => item.sourceType !== "SYSTEM")
      .map((item) => `/${item.name} (${item.sourceType.toLowerCase()}: ${item.sourceName})`)
      .slice(0, 20)
      .join(", ");

    return {
      handled: true,
      responseContent: summary || "No bot/app integration commands are available for this server yet.",
    };
  }

  if (selectedCommand.name === "bump") {
    const normalizedChannelId = String(channelId ?? "").trim();
    const normalizedActorProfileId = String(actorProfileId ?? "").trim();

    if (!normalizedChannelId || !normalizedActorProfileId) {
      return {
        handled: true,
        responseContent: "Unable to process /bump in this channel.",
      };
    }

    const targetServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    if (!targetServer) {
      return {
        handled: true,
        responseContent: "Server not found for /bump.",
      };
    }

    const ownerResult = await db.execute(sql`
      select
        coalesce(nullif(trim(u."name"), ''), nullif(trim(u."email"), ''), ${targetServer.profileId}) as "ownerDisplayName",
        u."email" as "ownerEmail"
      from "Users" u
      where u."userId" = ${targetServer.profileId}
      limit 1
    `);

    const ownerRow = (ownerResult as unknown as {
      rows?: Array<{ ownerDisplayName: string | null; ownerEmail: string | null }>;
    }).rows?.[0];

    const ensuredEntry = await upsertOurBoardEntry({
      serverId: targetServer.id,
      serverName: String(targetServer.name ?? "Untitled Server"),
      imageUrl: String(targetServer.imageUrl ?? "").trim() || null,
      ownerProfileId: String(targetServer.profileId ?? "").trim(),
      ownerDisplayName: String(ownerRow?.ownerDisplayName ?? targetServer.profileId ?? "Unknown Owner"),
      ownerEmail: ownerRow?.ownerEmail ?? null,
    });

    const bumpResult = await recordOurBoardBump({
      serverId: targetServer.id,
      channelId: normalizedChannelId,
      actorProfileId: normalizedActorProfileId,
    });

    if (!bumpResult.ok && bumpResult.code === "CHANNEL_NOT_ALLOWED") {
      return {
        handled: true,
        responseContent: "❌ /bump is not allowed in this channel. Ask an admin to update the allowed bump channel in Edit Server → In-Aboard.",
      };
    }

    if (!bumpResult.ok && bumpResult.code === "COOLDOWN") {
      const minutesRemaining = Math.max(1, Math.ceil(bumpResult.cooldownMsRemaining / 60_000));
      const hours = Math.floor(minutesRemaining / 60);
      const minutes = minutesRemaining % 60;
      const remainingLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      return {
        handled: true,
        responseContent: `⏳ Your /bump cooldown is active. Try again in ${remainingLabel}.`,
      };
    }

    const baseUrl =
      String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
      String(process.env.APP_BASE_URL ?? "").trim();
    const boardUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/in-aboard`
      : "/in-aboard";

    return {
      handled: true,
      responseContent:
        `🚀 ${targetServer.name} bumped on In-Aboard! ` +
        `Your next bump is available in ${Math.round(OUR_BOARD_BUMP_COOLDOWN_MS / 60_000)} minutes. ` +
        `Public board: ${boardUrl}`,
    };
  }

  if (selectedCommand.sourceType === "BOT") {
    const botCommandKey = String(selectedCommand.commandKey ?? "").trim().toLowerCase();

    if (botCommandKey === "help") {
      const botPrefix = selectedCommand.botSlug ? `${selectedCommand.botSlug}-` : "";
      const related = commands
        .filter((item) => item.sourceType === "BOT" && item.sourceName === selectedCommand.sourceName)
        .map((item) => `/${item.name}`)
        .slice(0, 25)
        .join(", ");

      return {
        handled: true,
        responseContent: related
          ? `${selectedCommand.sourceName} commands: ${related}`
          : `${selectedCommand.sourceName} has no configured commands.`,
        responseMemberId: selectedCommand.responseMemberId,
      };
    }

    if (botCommandKey === "ping") {
      return {
        handled: true,
        responseContent: `🏓 ${selectedCommand.sourceName}: pong`,
        responseMemberId: selectedCommand.responseMemberId,
      };
    }

    if (botCommandKey === "echo" || botCommandKey === "say" || botCommandKey === "repeat") {
      return {
        handled: true,
        responseContent: args ? `🗣️ ${selectedCommand.sourceName}: ${args}` : `🗣️ ${selectedCommand.sourceName}: (no text provided)`,
        responseMemberId: selectedCommand.responseMemberId,
      };
    }

    return {
      handled: true,
      responseContent: `✅ ${selectedCommand.sourceName} executed /${botCommandKey}${args ? ` with: ${args}` : ""}`,
      responseMemberId: selectedCommand.responseMemberId,
    };
  }

  if (/-about$/.test(selectedCommand.name)) {
    return {
      handled: true,
      responseContent: `ℹ️ App ${selectedCommand.sourceName} is connected and ready for slash command workflows.`,
      responseMemberId: selectedCommand.responseMemberId,
    };
  }

  return {
    handled: true,
    responseContent: `/${selectedCommand.name} executed.`,
    responseMemberId: selectedCommand.responseMemberId,
  };
};

export const hasServerMembership = async ({
  serverId,
  profileId,
}: {
  serverId: string;
  profileId: string;
}) => {
  const currentMember = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
  });

  return Boolean(currentMember);
};
