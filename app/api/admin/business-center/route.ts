import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { getEffectiveSiteUrl } from "@/lib/runtime-site-url-config";
import {
  ensureUserPreferencesSchema,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/user-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type BusinessCenterRow = {
  userId: string | null;
  email: string | null;
  role: string | null;
  displayName: string | null;
  imageUrl: string | null;
  businessCenterJson: string | null;
  preferenceUpdatedAt: Date | string | null;
};

type BusinessApplicationFile = {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

type BusinessMemberSeedRow = {
  profileName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
};

const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "inaccord";

const isPlaceholder = (value?: string) => !value || value.trim() === "" || value.includes("replace_me");

const hasR2Config =
  !isPlaceholder(r2AccountId) &&
  !isPlaceholder(r2AccessKeyId) &&
  !isPlaceholder(r2SecretAccessKey) &&
  !isPlaceholder(r2BucketName);

const r2Client = hasR2Config
  ? new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId!,
        secretAccessKey: r2SecretAccessKey!,
      },
    })
  : null;

const extractR2ObjectKey = async (url: string): Promise<string | null> => {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const baseUrl = await getEffectiveSiteUrl();
    const parsed = new URL(trimmed, baseUrl);
    const key = parsed.searchParams.get("key");
    return key && key.trim().length > 0 ? key.trim() : null;
  } catch {
    return null;
  }
};

const toIsoOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureUserPreferencesSchema();

    const result = await db.execute(sql`
      select
        u."userId" as "userId",
        u."email" as "email",
        u."role" as "role",
        coalesce(up."profileName", u."name", u."email", u."userId") as "displayName",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        pref."businessCenterJson" as "businessCenterJson",
        pref."updatedAt" as "preferenceUpdatedAt"
      from "Users" u
      left join "UserProfile" up on up."userId" = u."userId"
      left join "UserPreference" pref on pref."userId" = u."userId"
      order by coalesce(up."profileName", u."name", u."email", u."userId") asc
    `);

    const rows = ((result as unknown as { rows?: BusinessCenterRow[] }).rows ?? []).filter(
      (row): row is BusinessCenterRow => typeof row?.userId === "string" && row.userId.trim().length > 0
    );

    const entries = rows
      .map((row) => {
        const raw = row.businessCenterJson ?? "{}";
        let parsed: Record<string, unknown> = {};

        try {
          const decoded = JSON.parse(raw) as unknown;
          if (decoded && typeof decoded === "object") {
            parsed = decoded as Record<string, unknown>;
          }
        } catch {
          parsed = {};
        }

        const businessMembers = Array.isArray(parsed.businessMembers)
          ? parsed.businessMembers.filter((item) => item && typeof item === "object")
          : [];

        const businessDesignation =
          typeof parsed.businessDesignation === "string"
            ? parsed.businessDesignation.trim().slice(0, 80)
            : "";

        const businessSection =
          typeof parsed.businessSection === "string"
            ? parsed.businessSection.trim().slice(0, 80)
            : "";

        const applicationStatus =
          typeof parsed.businessApplicationStatus === "string"
            ? parsed.businessApplicationStatus.trim().slice(0, 80)
            : "";

        const applicationSubmittedAtSource =
          typeof parsed.businessApplicationSubmittedAt === "string"
            ? parsed.businessApplicationSubmittedAt
            : "";

        const applicationFilesSource = Array.isArray(parsed.businessApplicationFiles)
          ? parsed.businessApplicationFiles
          : [];

        const applicationSubmittedAt =
          typeof applicationSubmittedAtSource === "string"
            ? toIsoOrNull(applicationSubmittedAtSource)
            : "";

        const applicationFiles = Array.isArray(applicationFilesSource)
          ? applicationFilesSource
              .filter((item): item is BusinessApplicationFile => {
                if (!item || typeof item !== "object") {
                  return false;
                }

                const candidate = item as Partial<BusinessApplicationFile>;
                return typeof candidate.name === "string" && typeof candidate.url === "string";
              })
              .map((file) => {
                const trimmedUrl = String(file.url ?? "").trim();
                const uploadedAt =
                  typeof file.uploadedAt === "string" && !Number.isNaN(new Date(file.uploadedAt).getTime())
                    ? new Date(file.uploadedAt).toISOString()
                    : toIsoOrNull(row.preferenceUpdatedAt) ?? new Date().toISOString();

                return {
                  name: String(file.name ?? "").trim().slice(0, 200),
                  url:
                    /^https?:\/\//i.test(trimmedUrl) || trimmedUrl.startsWith("/")
                      ? trimmedUrl.slice(0, 2048)
                      : "",
                  mimeType: String(file.mimeType ?? "application/octet-stream").trim().slice(0, 120).toLowerCase(),
                  size:
                    typeof file.size === "number" && Number.isFinite(file.size) && file.size > 0
                      ? Math.min(Math.floor(file.size), 100 * 1024 * 1024)
                      : 0,
                  uploadedAt,
                };
              })
              .filter((file) => file.name.length > 0 && file.url.length > 0)
              .slice(0, 20)
          : [];

        const isApplicationRecord = Boolean(applicationStatus) || Boolean(applicationSubmittedAt);

        return {
          userId: row.userId ?? "",
          displayName: row.displayName ?? row.userId ?? "User",
          email: row.email ?? "",
          role: row.role ?? "USER",
          applicationId: `${row.userId ?? "unknown"}-${(applicationSubmittedAt ?? toIsoOrNull(row.preferenceUpdatedAt) ?? "pending").replace(/[:.]/g, "-")}`,
          submittedBy: row.displayName ?? row.email ?? row.userId ?? "Unknown",
          imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
          businessMembersCount: businessMembers.length,
          businessDesignation: businessDesignation,
          businessSection,
          applicationStatus,
          applicationSubmittedAt,
          applicationFiles,
          preferenceUpdatedAt: toIsoOrNull(row.preferenceUpdatedAt),
          isApplicationRecord,
        };
      })
      .filter((entry) => entry.isApplicationRecord)
      .sort((a, b) => {
        const left = new Date(a.applicationSubmittedAt ?? a.preferenceUpdatedAt ?? 0).getTime();
        const right = new Date(b.applicationSubmittedAt ?? b.preferenceUpdatedAt ?? 0).getTime();
        return right - left;
      });

    const summary = {
      totalBusinessRecords: entries.length,
      totalMembersTracked: entries.reduce((sum, entry) => sum + entry.businessMembersCount, 0),
      pendingApplications: entries.filter((entry) => /pending/i.test(entry.applicationStatus)).length,
      approvedApplications: entries.filter((entry) => /approved|aproved/i.test(entry.applicationStatus)).length,
    };

    return NextResponse.json({ entries, summary });
  } catch (error) {
    console.error("[ADMIN_BUSINESS_CENTER_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim();

    if (!userId) {
      return new NextResponse("userId is required", { status: 400 });
    }

    await ensureUserPreferencesSchema();

    const current = await getUserPreferences(userId);
    const nextBusinessCenter = {
      ...current.businessCenter,
      businessApplicationStatus: "",
      businessApplicationSubmittedAt: "",
      businessApplicationFiles: [],
    };

    await updateUserPreferences(userId, {
      businessCenter: nextBusinessCenter,
    });

    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    console.error("[ADMIN_BUSINESS_CENTER_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      userId?: unknown;
      decision?: unknown;
      status?: unknown;
    };

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return new NextResponse("userId is required", { status: 400 });
    }

    const rawDecision = String(body.decision ?? body.status ?? "").trim().toUpperCase();
    let nextStatus = "";
    const approverLabel =
      String(profile.profileName ?? "").trim() ||
      String(profile.name ?? "").trim() ||
      String(profile.email ?? "").trim() ||
      String(profile.userId ?? "").trim() ||
      "Unknown";

    const isApproveDecision =
      rawDecision === "ACCEPT" || rawDecision === "APPROVE" || rawDecision === "APPROVED";

    if (isApproveDecision) {
      nextStatus = `Approved by: ${approverLabel}`;
    } else if (rawDecision === "DECLINE" || rawDecision === "DECLINED") {
      nextStatus = `Denied by: ${approverLabel}`;
    } else {
      return new NextResponse("decision must be ACCEPT or DECLINE", { status: 400 });
    }

    await ensureUserPreferencesSchema();

    const current = await getUserPreferences(userId);

    const currentBusinessCenter = current.businessCenter as Record<string, unknown>;

    let nextApplicationFiles = Array.isArray(currentBusinessCenter.businessApplicationFiles)
      ? (currentBusinessCenter.businessApplicationFiles as BusinessApplicationFile[])
      : [];

    if (r2Client && nextApplicationFiles.length > 0) {
      const primaryFile = nextApplicationFiles[0];
      const sourceKey = await extractR2ObjectKey(primaryFile.url);

      if (sourceKey) {
        const suffix = isApproveDecision ? "Approved" : "Denied";
        const targetFileName = `${userId}-business-application-${suffix}.pdf`;
        const targetKey = `Client/Applications/${targetFileName}`;

        const sourceObject = await r2Client.send(
          new GetObjectCommand({
            Bucket: r2BucketName,
            Key: sourceKey,
          })
        );

        if (sourceObject.Body) {
          const copiedSize =
            typeof sourceObject.ContentLength === "number" && Number.isFinite(sourceObject.ContentLength)
              ? Math.max(0, Math.floor(sourceObject.ContentLength))
              : Math.max(0, Math.floor(Number(primaryFile.size) || 0));

          await r2Client.send(
            new PutObjectCommand({
              Bucket: r2BucketName,
              Key: targetKey,
              Body: sourceObject.Body,
              ContentType: "application/pdf",
            })
          );

          if (sourceKey !== targetKey) {
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: r2BucketName,
                Key: sourceKey,
              })
            );
          }

          const appUrl = await getEffectiveSiteUrl();
          const targetUrl = `${appUrl}/api/r2/object?key=${encodeURIComponent(targetKey)}`;

          nextApplicationFiles = [
            {
              ...primaryFile,
              name: targetFileName,
              url: targetUrl,
              mimeType: "application/pdf",
              size: copiedSize,
              uploadedAt: new Date().toISOString(),
            },
            ...nextApplicationFiles.slice(1),
          ];
        }
      }
    }

    const existingBusinessMembers = Array.isArray(currentBusinessCenter.businessMembers)
      ? currentBusinessCenter.businessMembers.filter((item) => item && typeof item === "object")
      : [];

    let nextBusinessMembers = existingBusinessMembers;

    if (isApproveDecision && existingBusinessMembers.length === 0) {
      const seedResult = await db.execute(sql`
        select
          coalesce(up."profileName", u."name", u."email", u."userId") as "profileName",
          u."email" as "email",
          nullif(trim(to_jsonb(u)->>'phone'), '') as "phone",
          nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth"
        from "Users" u
        left join "UserProfile" up on up."userId" = u."userId"
        where u."userId" = ${userId}
        limit 1
      `);

      const seedRow = ((seedResult as unknown as { rows?: BusinessMemberSeedRow[] }).rows ?? [])[0];
      const createdAt = new Date().toISOString();
      const businessDesignation =
        typeof currentBusinessCenter.businessDesignation === "string"
          ? currentBusinessCenter.businessDesignation.trim().slice(0, 80)
          : "";
      const businessSection =
        typeof currentBusinessCenter.businessSection === "string"
          ? currentBusinessCenter.businessSection.trim().slice(0, 80)
          : "";

      const seededProfileName =
        String(seedRow?.profileName ?? "").trim() || String(userId ?? "").trim() || "Business Member";

      nextBusinessMembers = [
        {
          id: `business-member-${userId}`,
          childName: seededProfileName,
          accountIdentifier: seededProfileName,
          childRelation: businessDesignation,
          childSection: businessSection,
          childEmail: String(seedRow?.email ?? "").trim().slice(0, 160),
          childPassword: "",
          childPhone: String(seedRow?.phone ?? "").trim().slice(0, 32),
          childDateOfBirth: String(seedRow?.dateOfBirth ?? "").trim().slice(0, 10),
          linkedUserId: userId,
          familyLinkState: "normal",
          createdAt,
          requireContentFilterForFamilyMembers:
            typeof currentBusinessCenter.requireContentFilterForFamilyMembers === "boolean"
              ? currentBusinessCenter.requireContentFilterForFamilyMembers
              : true,
          shareWeeklySafetySummary:
            typeof currentBusinessCenter.shareWeeklySafetySummary === "boolean"
              ? currentBusinessCenter.shareWeeklySafetySummary
              : true,
          allowDirectMessagesFromNonFriends:
            typeof currentBusinessCenter.allowDirectMessagesFromNonFriends === "boolean"
              ? currentBusinessCenter.allowDirectMessagesFromNonFriends
              : false,
          alertOnMatureContentInteractions:
            typeof currentBusinessCenter.alertOnMatureContentInteractions === "boolean"
              ? currentBusinessCenter.alertOnMatureContentInteractions
              : true,
        },
      ];
    }

    const nextBusinessCenter = {
      ...current.businessCenter,
      businessApplicationStatus: nextStatus,
      businessApplicationSubmittedAt:
        String(currentBusinessCenter.businessApplicationSubmittedAt ?? "") || new Date().toISOString(),
      businessApplicationFiles: nextApplicationFiles,
      businessMembers: nextBusinessMembers,
    };

    await updateUserPreferences(userId, {
      businessCenter: nextBusinessCenter,
    });

    return NextResponse.json({
      ok: true,
      userId,
      applicationStatus: nextStatus,
      applicationSubmittedAt: nextBusinessCenter.businessApplicationSubmittedAt,
    });
  } catch (error) {
    console.error("[ADMIN_BUSINESS_CENTER_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
