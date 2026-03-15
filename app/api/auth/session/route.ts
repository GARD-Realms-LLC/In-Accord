import { NextResponse } from "next/server";

import { getCurrentSessionContext, getCurrentSessionDiagnostics } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const diagnosticsRequested = new URL(request.url).searchParams.get("diagnostics") === "1";
    const session = await getCurrentSessionContext();

    if (!session) {
      const diagnostics = await getCurrentSessionDiagnostics();
      const status = diagnostics.code === "database-unavailable" ? 503 : 401;

      if (diagnosticsRequested) {
        return NextResponse.json(diagnostics, { status });
      }

      return new NextResponse(diagnostics.message, { status });
    }

    return NextResponse.json({ ok: true, userId: session.userId, sessionId: session.sessionId });
  } catch (error) {
    console.error("[AUTH_SESSION_GET]", error);

    const diagnostics = await getCurrentSessionDiagnostics().catch(() => null);
    if (new URL(request.url).searchParams.get("diagnostics") === "1" && diagnostics) {
      const status = diagnostics.code === "database-unavailable" ? 503 : 401;
      return NextResponse.json(diagnostics, { status });
    }

    return new NextResponse(diagnostics?.message || "Desktop session validation failed.", {
      status: diagnostics?.code === "database-unavailable" ? 503 : 401,
    });
  }
}