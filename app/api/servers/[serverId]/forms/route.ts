import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, profile, server } from "@/lib/db";
import type { Profile } from "@/lib/db/types";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { getServerManagementAccess } from "@/lib/server-management-access";
import {
  getServerOnboardingConfig,
  getServerOnboardingResponseByMember,
  getServerOnboardingResponses,
  setServerOnboardingResponseReview,
  upsertServerOnboardingResponse,
  type ServerOnboardingResponseAnswer,
  type ServerOnboardingReviewStatus,
} from "@/lib/server-onboarding-store";

type FormSubmitBody = {
  answers?: Array<{
    promptId?: string;
    values?: string[];
  }>;
};

type ReviewBody = {
  responseId?: string;
  reviewStatus?: ServerOnboardingReviewStatus;
  reviewNote?: string;
};

const REVIEW_STATUS_VALUES: ServerOnboardingReviewStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_REVIEW",
];

const normalizeAnswers = (rawAnswers: FormSubmitBody["answers"]): ServerOnboardingResponseAnswer[] => {
  if (!Array.isArray(rawAnswers)) {
    return [];
  }

  return rawAnswers
    .map((answerItem) => {
      const promptId = typeof answerItem?.promptId === "string" ? answerItem.promptId.trim() : "";
      const values = Array.isArray(answerItem?.values)
        ? Array.from(
            new Set(
              answerItem.values
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean)
            )
          ).slice(0, 12)
        : [];

      if (!promptId) {
        return null;
      }

      return {
        promptId,
        values,
      };
    })
    .filter((answerItem): answerItem is ServerOnboardingResponseAnswer => Boolean(answerItem))
    .slice(0, 8);
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const currentUser = await currentProfile();

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: currentUser.id,
      serverParam: serverId,
      profileRole: currentUser.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedServerId = resolvedServer.id;

    const access = await getServerManagementAccess({ serverId: resolvedServerId, profileId: currentUser.id, profileRole: currentUser.role });

    if (!access.canView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, resolvedServerId), eq(member.profileId, currentUser.id)),
    });

    const config = await getServerOnboardingConfig(resolvedServerId);
    const existingSubmission = membership
      ? await getServerOnboardingResponseByMember(resolvedServerId, membership.id)
      : null;

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    if (scope === "owner") {
      if (!access.canManage) {
        return new NextResponse("Only the server owner or an In-Accord administrator can view all submissions.", { status: 403 });
      }

      const responses = await getServerOnboardingResponses(resolvedServerId);
      const profileIds = Array.from(new Set(responses.map((item) => item.profileId).filter(Boolean)));

      const memberProfiles: Profile[] = profileIds.length
        ? await db.query.profile.findMany({
            where: inArray(profile.id, profileIds),
          })
        : [];

      const profileById = new Map<string, Profile>(memberProfiles.map((item) => [item.id, item]));

      return NextResponse.json({
        serverId: resolvedServerId,
        config,
        submissions: responses.map((item) => ({
          ...item,
          submitterName:
            profileById.get(item.profileId)?.name ||
            profileById.get(item.profileId)?.email ||
            item.profileId,
          submitterImageUrl: profileById.get(item.profileId)?.imageUrl ?? null,
        })),
      });
    }

    return NextResponse.json({
      serverId: resolvedServerId,
      config,
      canManageForms: access.canManage,
      submission: existingSubmission,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_FORMS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const currentUser = await currentProfile();

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: currentUser.id,
      serverParam: serverId,
      profileRole: currentUser.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedServerId = resolvedServer.id;

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, resolvedServerId), eq(member.profileId, currentUser.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getServerOnboardingConfig(resolvedServerId);
    if (!config.enabled) {
      return new NextResponse("Forms are disabled for this server.", { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as FormSubmitBody;
    const answers = normalizeAnswers(body.answers);

    const answersByPromptId = new Map(answers.map((answerItem) => [answerItem.promptId, answerItem]));

    for (const promptItem of config.prompts) {
      const answer = answersByPromptId.get(promptItem.id);
      const valueCount = answer?.values.length ?? 0;

      if (promptItem.required && valueCount === 0) {
        return new NextResponse(`Missing required answer for: ${promptItem.question}`, { status: 400 });
      }

      if (!promptItem.multiple && valueCount > 1) {
        return new NextResponse(`Only one answer is allowed for: ${promptItem.question}`, { status: 400 });
      }

      if (promptItem.options.length > 0 && valueCount > 0) {
        const allowed = new Set(promptItem.options);
        const invalid = answer?.values.find((value) => !allowed.has(value));
        if (invalid) {
          return new NextResponse(`Invalid option selected for: ${promptItem.question}`, { status: 400 });
        }
      }
    }

    const saved = await upsertServerOnboardingResponse({
      serverId: resolvedServerId,
      memberId: membership.id,
      profileId: currentUser.id,
      answers,
    });

    return NextResponse.json({
      ok: true,
      serverId: resolvedServerId,
      submission: saved,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_FORMS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const currentUser = await currentProfile();

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: currentUser.id,
      serverParam: serverId,
      profileRole: currentUser.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedServerId = resolvedServer.id;

    const access = await getServerManagementAccess({ serverId: resolvedServerId, profileId: currentUser.id, profileRole: currentUser.role });

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can moderate submissions.", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ReviewBody;
    const responseId = typeof body.responseId === "string" ? body.responseId.trim() : "";
    const reviewStatus = body.reviewStatus;

    if (!responseId) {
      return new NextResponse("Response ID missing", { status: 400 });
    }

    if (!reviewStatus || !REVIEW_STATUS_VALUES.includes(reviewStatus)) {
      return new NextResponse("Invalid review status", { status: 400 });
    }

    const updated = await setServerOnboardingResponseReview({
      serverId: resolvedServerId,
      responseId,
      reviewStatus,
      reviewNote: body.reviewNote,
      reviewedByProfileId: currentUser.id,
    });

    if (!updated) {
      return new NextResponse("Submission not found", { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      serverId: resolvedServerId,
      submission: updated,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_FORMS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
