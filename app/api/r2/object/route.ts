import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { Readable } from "stream";

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

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(req: Request) {
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
    const body = await streamToBuffer(response.Body as Readable);
    const payload = new Uint8Array(body);

    return new NextResponse(payload, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[R2_OBJECT_GET]", error);
    return new NextResponse("Not found", { status: 404 });
  }
}
