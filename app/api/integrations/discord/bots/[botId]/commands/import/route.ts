import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { importOtherBotCommandsForOwner } from "@/lib/discord-bot-commands";
import { updateOtherBotTemplateStats } from "@/lib/user-preferences";

export async function POST(
  _req: Request,
  context: { params: Promise<{ botId: string }> }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const botId = String(params.botId ?? "").trim();

    if (!botId) {
      return NextResponse.json({ error: "Missing bot id." }, { status: 400 });
    }

    const imported = await importOtherBotCommandsForOwner({
      ownerProfileId: profile.id,
      botId,
    });

    await updateOtherBotTemplateStats(profile.id, botId, {
      importsMadeDelta: 1,
      templatesImportedDelta: imported.importedCount,
    });

    return NextResponse.json({
      importedCount: imported.importedCount,
      commands: imported.commands,
      message: `Imported ${imported.importedCount} slash command${imported.importedCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;
      if (message === "Bot not found.") {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (
        message.includes("no stored token") ||
        message.includes("missing an Application ID")
      ) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      if (
        message.includes("Other rejected the bot token") ||
        message.includes("Other command import failed")
      ) {
        return NextResponse.json({ error: message }, { status: 502 });
      }

      if (message.includes("No valid slash commands")) {
        return NextResponse.json({ error: message }, { status: 422 });
      }
    }

    console.error("[Other_BOT_COMMAND_IMPORT_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
