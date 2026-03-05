import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getSessionUserId } from "@/lib/session";

const f = createUploadthing();

const handleAuth = async () => {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Unauthorized ");
  return { userId };
};

export const ourFileRouter = {
  serverImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => handleAuth())
    .onUploadComplete(() => {}),
  messageFile: f(["image", "pdf"])
    .middleware(async () => handleAuth())
    .onUploadComplete(() => {}),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
