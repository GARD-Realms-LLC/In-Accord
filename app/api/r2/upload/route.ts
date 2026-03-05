import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/current-profile";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord";

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
} as const;

function getFileExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > -1 ? filename.slice(dot).toLowerCase() : "";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
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

    const bytes = await file.arrayBuffer();
    const body = Buffer.from(bytes);
    const ext = getFileExtension(file.name) || ".bin";
    const fileName = `${Date.now()}-${safeFileName(user.id)}${ext}`;
    const key = `${prefix}${fileName}`;

    if (!r2Client) {
      const localSubDir = type === "userImage" ? "user-icons" : "server-icons";
      const localDir = path.join(process.cwd(), "public", "uploads", localSubDir);

      await mkdir(localDir, { recursive: true });
      await writeFile(path.join(localDir, fileName), body);

      const localUrl = `/uploads/${localSubDir}/${fileName}`;

      return NextResponse.json({
        url: localUrl,
        key: `local:${localSubDir}/${fileName}`,
        storage: "local",
        warning: "R2 not configured; saved locally for development",
        missing: missingKeys,
      });
    }

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const objectUrl = `${appUrl}/api/r2/object?key=${encodeURIComponent(key)}`;

    return NextResponse.json({ url: objectUrl, key });
  } catch (error) {
    console.error("[R2_UPLOAD_POST]", error);
    const message =
      error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
