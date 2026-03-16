import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { appendBannerDebugEvent } from "@/lib/banner-debug";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord";
const MAX_R2_OBJECT_BYTES = Math.max(1, Number(process.env.INACCORD_MAX_R2_OBJECT_BYTES || 100 * 1024 * 1024));
const ENABLE_DEV_PERF_LOGS =
  process.env.NODE_ENV !== "production" && process.env.INACCORD_DEV_PERF_LOGS === "1";

const logPerf = (label: string, startedAtMs: number, extra?: string) => {
  if (!ENABLE_DEV_PERF_LOGS) {
    return;
  }

  const elapsedMs = Date.now() - startedAtMs;
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[PERF] ${label} ${elapsedMs}ms${suffix}`);
};

const isPlaceholder = (value?: string) =>
  !value || value.trim() === "" || value.includes("replace_me");

const missingKeys = [
  ["CLOUDFLARE_R2_ACCOUNT_ID", accountId],
  ["CLOUDFLARE_R2_ACCESS_KEY_ID", accessKeyId],
  ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", secretAccessKey],
  ["CLOUDFLARE_R2_BUCKET_NAME", bucketName],
].filter(([, value]) => isPlaceholder(value)).map(([key]) => key);

const missingConfig = missingKeys.length > 0;

const r2Client =
  missingConfig
    ? null
    : new S3Client({
        region: "auto",
        endpoint: `https://${accountId!}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
      });

const guardReadableByteLimit = (stream: Readable, maxBytes: number) => {
  let seenBytes = 0;

  const guard = new Transform({
    transform(chunk, _encoding, callback) {
      const chunkLength = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      seenBytes += chunkLength;

      if (seenBytes > maxBytes) {
        callback(new Error(`R2 object exceeds max size of ${maxBytes} bytes`));
        return;
      }

      callback(null, chunk);
    },
  });

  return stream.pipe(guard);
};

export async function GET(req: Request) {
  const startedAtMs = ENABLE_DEV_PERF_LOGS ? Date.now() : 0;
  try {
    if (!r2Client) {
      return NextResponse.json(
        {
          error: "R2 configuration missing or placeholder values detected",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const userAgent = req.headers.get("user-agent");
    const referer = req.headers.get("referer");

    if (!key) {
      return new NextResponse("key is required", { status: 400 });
    }

    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    if (!response.Body) {
      return new NextResponse("Not found", { status: 404 });
    }

    const contentType = response.ContentType || "application/octet-stream";
    const contentLength =
      typeof response.ContentLength === "number" && Number.isFinite(response.ContentLength)
        ? Math.max(0, Math.floor(response.ContentLength))
        : null;

    if (contentLength !== null && contentLength > MAX_R2_OBJECT_BYTES) {
      return NextResponse.json(
        { error: `Object exceeds max size of ${MAX_R2_OBJECT_BYTES} bytes.` },
        { status: 413 }
      );
    }

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    if (contentLength !== null) {
      headers.set("Content-Length", String(contentLength));
    }

    if (response.ContentDisposition) {
      headers.set("Content-Disposition", response.ContentDisposition);
    }

    if (response.ETag) {
      headers.set("ETag", response.ETag);
    }

    const body = response.Body as unknown;
    const shouldGuardAtRuntime = contentLength === null;

    if (body instanceof Readable) {
      void appendBannerDebugEvent({
        source: "api/r2/object",
        stage: "stream",
        requestUrl: req.url,
        key,
        status: 200,
        metadata: {
          contentType,
          contentLength,
          userAgent,
          referer,
        },
      });
      const effectiveBody = shouldGuardAtRuntime ? guardReadableByteLimit(body, MAX_R2_OBJECT_BYTES) : body;
      logPerf("r2.object.get", startedAtMs, `status=200 mode=node-readable guarded=${shouldGuardAtRuntime}`);
      return new Response(Readable.toWeb(effectiveBody) as unknown as ReadableStream, {
        status: 200,
        headers,
      });
    }

    if (body && typeof (body as { transformToWebStream?: () => NodeReadableStream }).transformToWebStream === "function") {
      const webStream = (body as { transformToWebStream: () => NodeReadableStream }).transformToWebStream();
      const nodeBody = Readable.fromWeb(webStream);
      const effectiveBody = shouldGuardAtRuntime ? guardReadableByteLimit(nodeBody, MAX_R2_OBJECT_BYTES) : nodeBody;
      void appendBannerDebugEvent({
        source: "api/r2/object",
        stage: "stream",
        requestUrl: req.url,
        key,
        status: 200,
        metadata: {
          contentType,
          contentLength,
          userAgent,
          referer,
        },
      });
      logPerf("r2.object.get", startedAtMs, `status=200 mode=web-stream guarded=${shouldGuardAtRuntime}`);
      return new Response(Readable.toWeb(effectiveBody) as unknown as ReadableStream, {
        status: 200,
        headers,
      });
    }

    return NextResponse.json({ error: "Unsupported object stream type" }, { status: 500 });
  } catch (error) {
    void appendBannerDebugEvent({
      source: "api/r2/object",
      stage: "error",
      requestUrl: req.url,
      key: new URL(req.url).searchParams.get("key"),
      status: 404,
      detail: error instanceof Error ? error.message : String(error ?? "Unknown error"),
      metadata: {
        userAgent: req.headers.get("user-agent"),
        referer: req.headers.get("referer"),
      },
    });
    logPerf("r2.object.get", startedAtMs, "status=404");
    console.error("[R2_OBJECT_GET]", error);
    return new NextResponse("Not found", { status: 404 });
  }
}
