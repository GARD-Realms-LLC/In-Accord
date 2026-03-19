import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/current-profile";
import { getEffectiveSiteUrl } from "@/lib/runtime-site-url-config";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord";
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

const prefixMap = {
  serverImage: "Client/Server Icons/",
  userImage: "Client/User Icons/",
  userBanner: "Client/User Banners/",
  familyApplication: "Client/Family Applications/",
} as const;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function getFileExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > -1 ? filename.slice(dot).toLowerCase() : "";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  const startedAtMs = ENABLE_DEV_PERF_LOGS ? Date.now() : 0;
  try {
    const user = await currentProfile();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "serverImage") as keyof typeof prefixMap;
    const prefix = prefixMap[type];

    if (!prefix) {
      return new NextResponse("Unsupported upload type", { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new NextResponse("File is required", { status: 400 });
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      return new NextResponse("File is empty or invalid", { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return new NextResponse(`File exceeds max size of ${MAX_UPLOAD_BYTES} bytes`, { status: 413 });
    }

    const ext = getFileExtension(file.name) || ".bin";
    const fileName = `${Date.now()}-${safeFileName(user.id)}${ext}`;
    const key = `${prefix}${fileName}`;

    if (!r2Client) {
      return NextResponse.json(
        {
          error: "Cloudflare R2 image storage is required and is not fully configured.",
        },
        { status: 503 }
      );
    }

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: Readable.fromWeb(file.stream() as unknown as NodeReadableStream),
        ContentLength: file.size,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const appUrl = await getEffectiveSiteUrl();
    const objectPath = `/api/r2/object?key=${encodeURIComponent(key)}`;
    const objectUrl = `${appUrl}${objectPath}`;

    logPerf("r2.upload.post", startedAtMs, `status=200 storage=r2 bytes=${file.size}`);
    return NextResponse.json({ url: objectPath, appUrl: objectUrl, key });
  } catch (error) {
    logPerf("r2.upload.post", startedAtMs, "status=500");
    console.error("[R2_UPLOAD_POST]", error);
    const message =
      error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
