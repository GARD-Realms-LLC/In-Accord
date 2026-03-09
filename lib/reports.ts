import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ReportTargetType = "USER" | "SERVER" | "MESSAGE" | "BUG";
export type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

export const allowedReportTargetTypes = new Set<ReportTargetType>(["USER", "SERVER", "MESSAGE", "BUG"]);
export const allowedReportStatuses = new Set<ReportStatus>([
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);

let reportSchemaReady = false;

export const ensureReportSchema = async () => {
  if (reportSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "Report" (
      "id" varchar(191) primary key,
      "reporterProfileId" varchar(191) not null,
      "targetType" varchar(16) not null,
      "targetId" varchar(191) not null,
      "reason" text,
      "details" text,
      "status" varchar(24) not null default 'OPEN',
      "adminNote" text,
      "assignedAdminProfileId" varchar(191),
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "Report_status_createdAt_idx"
    on "Report" ("status", "createdAt")
  `);

  await db.execute(sql`
    create index if not exists "Report_target_idx"
    on "Report" ("targetType", "targetId")
  `);

  reportSchemaReady = true;
};
