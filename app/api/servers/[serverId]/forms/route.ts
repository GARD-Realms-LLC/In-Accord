import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, profile, server } from "@/lib/db";
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

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, currentUser.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getServerOnboardingConfig(serverId);
    const existingSubmission = await getServerOnboardingResponseByMember(serverId, membership.id);

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, currentUser.id)),
    });

    if (scope === "owner") {
      if (!ownerServer) {
        return new NextResponse("Only the server owner can view all submissions.", { status: 403 });
      }

      const responses = await getServerOnboardingResponses(serverId);
      const profileIds = Array.from(new Set(responses.map((item) => item.profileId).filter(Boolean)));

      const memberProfiles = profileIds.length
        ? await db.query.profile.findMany({
            where: inArray(profile.id, profileIds),
          })
        : [];

      const profileById = new Map(memberProfiles.map((item) => [item.id, item]));

      return NextResponse.json({
        serverId,
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
      serverId,
      config,
      canManageForms: Boolean(ownerServer),
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

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, currentUser.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getServerOnboardingConfig(serverId);
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
      serverId,
      memberId: membership.id,
      profileId: currentUser.id,
      answers,
    });

    return NextResponse.json({
      ok: true,
      serverId,
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

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, currentUser.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can moderate submissions.", { status: 403 });
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
      serverId,
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
      serverId,
      submission: updated,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_FORMS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
