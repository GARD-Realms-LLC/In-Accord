import type { NextApiRequest, NextApiResponse } from "next";

declare global {
  // eslint-disable-next-line no-var
  var inAccordWebRtcProbeReport: Record<string, unknown> | undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body !== null ? req.body : {};
    globalThis.inAccordWebRtcProbeReport = body as Record<string, unknown>;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "GET") {
    res.status(200).json(globalThis.inAccordWebRtcProbeReport ?? { ok: false, report: null });
    return;
  }

  res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
