import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { currentProfile } from "@/lib/current-profile";
import {
  ensureUserPreferencesSchema,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/user-preferences";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord";

const isPlaceholder = (value?: string) => !value || value.trim() === "" || value.includes("replace_me");

const missingKeys = [
  ["CLOUDFLARE_R2_ACCOUNT_ID", accountId],
  ["CLOUDFLARE_R2_ACCESS_KEY_ID", accessKeyId],
  ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", secretAccessKey],
  ["CLOUDFLARE_R2_BUCKET_NAME", bucketName],
]
  .filter(([, value]) => isPlaceholder(value))
  .map(([key]) => key);

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

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const fitWithin = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: width * ratio,
    height: height * ratio,
  };
};

const drawTextLines = (
  page: ReturnType<PDFDocument["addPage"]>,
  lines: string[],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
) => {
  const { height } = page.getSize();
  let y = height - 56;

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 40,
      y,
      size: index === 0 ? 16 : 11,
      font,
      color: index === 0 ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
      maxWidth: 515,
    });

    y -= index === 0 ? 24 : 16;
  });
};

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const familyDesignation = String(formData.get("familyDesignation") ?? "").trim().slice(0, 80);
    const legalName = String(formData.get("legalName") ?? "").trim().slice(0, 120);
    const profileName = String(formData.get("profileName") ?? "").trim().slice(0, 120);
    const email = String(formData.get("email") ?? profile.email ?? "").trim().slice(0, 180);
    const phone = String(formData.get("phone") ?? profile.phoneNumber ?? "").trim().slice(0, 64);
    const dateOfBirth = String(formData.get("dateOfBirth") ?? profile.dateOfBirth ?? "").trim().slice(0, 32);

    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File)
      .filter((file) => file.size > 0)
      .slice(0, 20);

    if (!familyDesignation) {
      return NextResponse.json({ error: "Family designation is required." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Attach at least one verification file." }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const coverPage = pdfDoc.addPage([595.28, 841.89]);
    drawTextLines(
      coverPage,
      [
        "In-Accord Family Application",
        `Submitted At: ${new Date().toISOString()}`,
        `User ID: ${profile.userId}`,
        `Legal Name: ${legalName || "Not set"}`,
        `Profile Name: ${profileName || "Not set"}`,
        `Email: ${email || "Not set"}`,
        `Phone: ${phone || "Not set"}`,
        `Date of Birth: ${dateOfBirth || "Not set"}`,
        `Family Designation: ${familyDesignation}`,
        "",
        "Attached Verification Documents:",
        ...files.map((file, index) => `${index + 1}. ${file.name} (${file.type || "unknown"}, ${file.size} bytes)`),
      ],
      font
    );

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const type = (file.type || "").toLowerCase();

      if (type === "image/jpeg" || type === "image/jpg" || type === "image/png") {
        const image = type.includes("png")
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);

        const page = pdfDoc.addPage([595.28, 841.89]);
        page.drawText(file.name.slice(0, 120), {
          x: 40,
          y: 810,
          size: 11,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });

        const bounds = fitWithin(image.width, image.height, 515, 730);
        const x = (595.28 - bounds.width) / 2;
        const y = (780 - bounds.height) / 2 + 20;

        page.drawImage(image, {
          x,
          y,
          width: bounds.width,
          height: bounds.height,
        });

        continue;
      }

      if (type === "application/pdf") {
        const sourcePdf = await PDFDocument.load(bytes);
        const sourcePageIndices = sourcePdf.getPageIndices();

        if (sourcePageIndices.length > 0) {
          const copiedPages = await pdfDoc.copyPages(sourcePdf, sourcePageIndices);
          copiedPages.forEach((page) => pdfDoc.addPage(page));
        }

        continue;
      }

      const page = pdfDoc.addPage([595.28, 841.89]);
      drawTextLines(
        page,
        [
          "Unsupported verification file type",
          `File: ${file.name}`,
          `Type: ${file.type || "unknown"}`,
          "The original file was not embedded in this PDF package.",
        ],
        font
      );
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPayload = new Uint8Array(pdfBytes);
    const key = `Client/Applications/${Date.now()}-${safeFileName(profile.userId)}-family-application.pdf`;
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    let pdfUrl = "";

    if (r2Client) {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: pdfPayload,
          ContentType: "application/pdf",
        })
      );

      pdfUrl = `${appUrl}/api/r2/object?key=${encodeURIComponent(key)}`;
    } else {
      const fileName = `${Date.now()}-${safeFileName(profile.userId)}-family-application.pdf`;
      const localSubDir = "family-applications";
      const localDir = path.join(process.cwd(), "public", "uploads", localSubDir);
      await mkdir(localDir, { recursive: true });
      await writeFile(path.join(localDir, fileName), pdfPayload);
      pdfUrl = `/uploads/${localSubDir}/${fileName}`;
    }

    await ensureUserPreferencesSchema();
    const currentPreferences = await getUserPreferences(profile.id);
    const submittedAtIso = new Date().toISOString();

    const nextFamilyCenter = {
      ...currentPreferences.familyCenter,
      familyDesignation,
      familyApplicationStatus: "Submitted",
      familyApplicationSubmittedAt: submittedAtIso,
      familyApplicationFiles: [
        {
          name: `${profile.userId}-family-application.pdf`,
          url: pdfUrl,
          mimeType: "application/pdf",
          size: pdfBytes.byteLength,
          uploadedAt: submittedAtIso,
        },
      ],
    };

    const updated = await updateUserPreferences(profile.id, {
      familyCenter: nextFamilyCenter,
    });

    return NextResponse.json({
      ok: true,
      pdfUrl,
      key,
      familyCenter: updated.familyCenter,
    });
  } catch (error) {
    console.error("[FAMILY_APPLICATION_SUBMIT_POST]", error);
    const message = error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
