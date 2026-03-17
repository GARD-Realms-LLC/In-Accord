import type { NextApiRequest, NextApiResponse } from "next";

declare global {
  // eslint-disable-next-line no-var
  var inAccordMeetingPanelProbeReports: Record<string, Record<string, unknown>> | undefined;
}

const EXPECTED_ROLE_COUNT = 5;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body !== null ? req.body : {};
    const role = String((body as { role?: unknown }).role ?? "unknown").trim() || "unknown";

    globalThis.inAccordMeetingPanelProbeReports = {
      ...(globalThis.inAccordMeetingPanelProbeReports ?? {}),
      [role]: {
        ...body,
        role,
        receivedAt: Date.now(),
      } as Record<string, unknown>,
    };

    res.status(200).json({ ok: true, role });
    return;
  }

  if (req.method === "GET") {
    const reports = globalThis.inAccordMeetingPanelProbeReports ?? {};
    const roleEntries = Object.values(reports);
    const ok = roleEntries.length >= EXPECTED_ROLE_COUNT && roleEntries.every((entry) => Boolean(entry?.ok));
    res.status(200).json({ ok, reports, count: roleEntries.length });
    return;
  }

  res.status(405).json({ ok: false, error: "Method Not Allowed" });
}