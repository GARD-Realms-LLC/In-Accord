import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getSessionUserId } from "@/lib/session";

const uploadThingToken = String(process.env.UPLOADTHING_TOKEN ?? "").trim();

const validateUploadThingToken = (token: string) => {
  if (!token || /^replace_me/i.test(token)) {
    throw new Error(
      "UploadThing is not configured. Set a real UPLOADTHING_TOKEN in .env (not a placeholder)."
    );
  }

  try {
    const parsed = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as {
      apiKey?: unknown;
      appId?: unknown;
      regions?: unknown;
    };

    const isValid =
      typeof parsed?.apiKey === "string" &&
      parsed.apiKey.length > 0 &&
      typeof parsed?.appId === "string" &&
      parsed.appId.length > 0 &&
      Array.isArray(parsed?.regions) &&
      parsed.regions.every((region) => typeof region === "string" && region.length > 0);

    if (!isValid) {
      throw new Error("Token shape mismatch");
    }
  } catch {
    throw new Error(
      "UPLOADTHING_TOKEN is invalid. Paste the exact token from UploadThing dashboard (base64 JSON token), without quotes."
    );
  }
};

const f = createUploadthing();

const ensureUploadThingConfigured = () => {
  validateUploadThingToken(uploadThingToken);
};

const handleAuth = async () => {
  ensureUploadThingConfigured();
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Unauthorized ");
  return { userId };
};

export const ourFileRouter = {
  serverImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => handleAuth())
    .onUploadComplete(({ file }) => ({
      url: file.url,
      key: file.key,
    })),
  messageFile: f(["image", "pdf"])
    .middleware(async () => handleAuth())
    .onUploadComplete(({ file }) => ({
      url: file.url,
      key: file.key,
    })),
  emojiImage: f({ image: { maxFileSize: "2MB", maxFileCount: 12 } })
    .middleware(async () => handleAuth())
    .onUploadComplete(({ file }) => ({
      url: file.url,
      key: file.key,
    })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
