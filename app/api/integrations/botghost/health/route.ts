import { NextResponse } from "next/server";

type HealthBody = {
  webhookUrl?: unknown;
  apiKey?: unknown;
};

const isLikelyBotGhostWebhook = (url: URL) => {
  const hostname = url.hostname.toLowerCase();
  return hostname.includes("botghost.com") || hostname.includes("discord.com") || hostname.includes("discordapp.com");
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as HealthBody;
    const webhookUrl = String(body.webhookUrl ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();

    if (!webhookUrl) {
      return NextResponse.json(
        { ok: false, status: "unhealthy", message: "Webhook URL is required." },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch {
      return NextResponse.json(
        { ok: false, status: "unhealthy", message: "Webhook URL must be a valid URL." },
        { status: 400 }
      );
    }

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { ok: false, status: "unhealthy", message: "Webhook URL must use HTTPS." },
        { status: 400 }
      );
    }

    if (!isLikelyBotGhostWebhook(parsedUrl)) {
      return NextResponse.json(
        {
          ok: false,
          status: "unhealthy",
          message: "Webhook host does not look like BotGhost/Discord.",
        },
        { status: 400 }
      );
    }

    if (apiKey && apiKey.length < 8) {
      return NextResponse.json(
        { ok: false, status: "unhealthy", message: "API key appears too short." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(webhookUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "In-Accord BotGhost Health Check",
        },
      });

      clearTimeout(timeout);

      if (response.ok || response.status === 401 || response.status === 403 || response.status === 405) {
        return NextResponse.json({
          ok: true,
          status: "healthy",
          message: "BotGhost endpoint looks reachable.",
          statusCode: response.status,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          status: "unhealthy",
          message: `Endpoint responded with status ${response.status}.`,
          statusCode: response.status,
        },
        { status: 502 }
      );
    } catch {
      clearTimeout(timeout);
      return NextResponse.json(
        { ok: false, status: "unhealthy", message: "Could not reach BotGhost endpoint." },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[BOTGHOST_HEALTH_POST]", error);
    return NextResponse.json({ ok: false, status: "unhealthy", message: "Internal Error" }, { status: 500 });
  }
}
