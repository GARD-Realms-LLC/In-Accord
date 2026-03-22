import "server-only";

import { eq, or, sql } from "drizzle-orm";

import { conversation, db, member } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { parseMentionSegments } from "@/lib/mentions";
import { extractQuotedContent } from "@/lib/message-quotes";
import { getUserPreferences } from "@/lib/user-preferences";

type NotificationRecipient = {
  profileId: string;
  email: string;
  displayName: string;
};

type ChannelNotificationReason = "mention" | "reply";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizePreview = (rawContent: string) => {
  const { body } = extractQuotedContent(String(rawContent ?? ""));
  const normalized = parseMentionSegments(body)
    .map((segment) => (segment.kind === "mention" ? `@${segment.label}` : segment.value))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.slice(0, 280);
};

const getRecipientDirectory = async (profileIds: string[]) => {
  const normalizedProfileIds = Array.from(
    new Set(
      profileIds
        .map((profileId) => String(profileId ?? "").trim())
        .filter((profileId) => profileId.length > 0)
    )
  );

  if (normalizedProfileIds.length === 0) {
    return new Map<string, NotificationRecipient>();
  }

  const result = await db.execute(sql`
    select
      "userId" as "profileId",
      "email" as "email",
      "name" as "displayName"
    from "Users"
    where "userId" in (${sql.join(normalizedProfileIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const rows = ((result as unknown as {
    rows?: Array<{
      profileId: string | null;
      email: string | null;
      displayName: string | null;
    }>;
  }).rows ?? [])
    .map((row) => ({
      profileId: String(row.profileId ?? "").trim(),
      email: String(row.email ?? "").trim(),
      displayName: String(row.displayName ?? "").trim(),
    }))
    .filter((row) => row.profileId.length > 0 && row.email.length > 0);

  return new Map<string, NotificationRecipient>(
    rows.map((row) => [
      row.profileId,
      {
        profileId: row.profileId,
        email: row.email,
        displayName: row.displayName || row.email,
      },
    ])
  );
};

const sendDirectMessageEmail = async ({
  recipient,
  senderDisplayName,
  preview,
  fileUrl,
}: {
  recipient: NotificationRecipient;
  senderDisplayName: string;
  preview: string;
  fileUrl: string | null;
}) => {
  const textLines = [
    `Hi ${recipient.displayName},`,
    "",
    `${senderDisplayName} sent you a new direct message on In-Accord.`,
    "",
    `Message: ${preview || "[attachment]"}`,
    ...(fileUrl ? ["", `Attachment: ${fileUrl}`] : []),
  ];

  const html = [
    `<p>Hi ${escapeHtml(recipient.displayName)},</p>`,
    `<p><strong>${escapeHtml(senderDisplayName)}</strong> sent you a new direct message on In-Accord.</p>`,
    `<p><strong>Message:</strong> ${escapeHtml(preview || "[attachment]")}</p>`,
    ...(fileUrl ? [`<p><strong>Attachment:</strong> ${escapeHtml(fileUrl)}</p>`] : []),
  ].join("");

  await sendEmail({
    to: recipient.email,
    subject: `New direct message from ${senderDisplayName}`,
    text: textLines.join("\n"),
    html,
  });
};

const buildChannelNotificationCopy = ({
  senderDisplayName,
  channelName,
  reasons,
  preview,
  fileUrl,
}: {
  senderDisplayName: string;
  channelName: string;
  reasons: Set<ChannelNotificationReason>;
  preview: string;
  fileUrl: string | null;
}) => {
  const isReply = reasons.has("reply");
  const isMention = reasons.has("mention");
  const channelLabel = channelName ? `#${channelName}` : "a channel";

  const subject = isReply && isMention
    ? `New reply and mention from ${senderDisplayName} in ${channelLabel}`
    : isReply
      ? `New reply from ${senderDisplayName} in ${channelLabel}`
      : `New mention from ${senderDisplayName} in ${channelLabel}`;

  const summary = isReply && isMention
    ? `${senderDisplayName} mentioned you and replied to you in ${channelLabel} on In-Accord.`
    : isReply
      ? `${senderDisplayName} replied to you in ${channelLabel} on In-Accord.`
      : `${senderDisplayName} mentioned you in ${channelLabel} on In-Accord.`;

  return {
    subject,
    text: [
      summary,
      "",
      `Message: ${preview || "[attachment]"}`,
      ...(fileUrl ? ["", `Attachment: ${fileUrl}`] : []),
    ].join("\n"),
    html: [
      `<p>${escapeHtml(summary)}</p>`,
      `<p><strong>Message:</strong> ${escapeHtml(preview || "[attachment]")}</p>`,
      ...(fileUrl ? [`<p><strong>Attachment:</strong> ${escapeHtml(fileUrl)}</p>`] : []),
    ].join(""),
  };
};

export const sendDirectMessageEmailNotifications = async ({
  conversationId,
  senderProfileId,
  senderDisplayName,
  content,
  fileUrl,
}: {
  conversationId: string;
  senderProfileId: string;
  senderDisplayName: string;
  content: string;
  fileUrl: string | null;
}) => {
  const currentConversation = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    columns: {
      memberOneId: true,
      memberTwoId: true,
    },
  });

  if (!currentConversation?.memberOneId || !currentConversation.memberTwoId) {
    return;
  }

  const participantRows = await db.query.member.findMany({
    where: or(
      eq(member.id, currentConversation.memberOneId),
      eq(member.id, currentConversation.memberTwoId)
    ),
    columns: {
      profileId: true,
    },
  });

  const recipientProfileIds = participantRows
    .map((row) => String(row.profileId ?? "").trim())
    .filter((profileId) => profileId.length > 0 && profileId !== senderProfileId);

  const directory = await getRecipientDirectory(recipientProfileIds);
  const preview = normalizePreview(content);

  for (const recipientProfileId of recipientProfileIds) {
    const recipient = directory.get(recipientProfileId);
    if (!recipient) {
      continue;
    }

    const preferences = await getUserPreferences(recipientProfileId);
    if (!preferences.notifications.emailNotifications || !preferences.notifications.notifyOnDirectMessages) {
      continue;
    }

    await sendDirectMessageEmail({
      recipient,
      senderDisplayName,
      preview,
      fileUrl,
    });
  }
};

export const sendChannelEmailNotifications = async ({
  serverId,
  channelName,
  senderProfileId,
  senderDisplayName,
  content,
  fileUrl,
}: {
  serverId: string;
  channelName: string;
  senderProfileId: string;
  senderDisplayName: string;
  content: string;
  fileUrl: string | null;
}) => {
  const { quote } = extractQuotedContent(content);
  const mentionSegments = parseMentionSegments(content).filter(
    (segment): segment is Extract<typeof segment, { kind: "mention" }> => segment.kind === "mention"
  );

  const reasonsByProfileId = new Map<string, Set<ChannelNotificationReason>>();

  if (quote?.authorProfileId && quote.authorProfileId !== senderProfileId) {
    reasonsByProfileId.set(quote.authorProfileId, new Set<ChannelNotificationReason>(["reply"]));
  }

  for (const segment of mentionSegments) {
    if (segment.entityType !== "user") {
      continue;
    }

    const profileId = String(segment.entityId ?? "").trim();
    if (!profileId || profileId === senderProfileId) {
      continue;
    }

    const existing = reasonsByProfileId.get(profileId) ?? new Set<ChannelNotificationReason>();
    existing.add("mention");
    reasonsByProfileId.set(profileId, existing);
  }

  if (reasonsByProfileId.size === 0) {
    return;
  }

  const directory = await getRecipientDirectory(Array.from(reasonsByProfileId.keys()));
  const preview = normalizePreview(content);

  for (const [profileId, reasons] of Array.from(reasonsByProfileId.entries())) {
    const recipient = directory.get(profileId);
    if (!recipient) {
      continue;
    }

    const preferences = await getUserPreferences(profileId);
    if (!preferences.notifications.emailNotifications) {
      continue;
    }

    const wantsReply = reasons.has("reply") && preferences.notifications.notifyOnReplies;
    const wantsMention = reasons.has("mention") && preferences.notifications.notifyOnServerMessages;

    if (!wantsReply && !wantsMention) {
      continue;
    }

    const enabledReasons = new Set<ChannelNotificationReason>();
    if (wantsReply) {
      enabledReasons.add("reply");
    }
    if (wantsMention) {
      enabledReasons.add("mention");
    }

    const copy = buildChannelNotificationCopy({
      senderDisplayName,
      channelName,
      reasons: enabledReasons,
      preview,
      fileUrl,
    });

    await sendEmail({
      to: recipient.email,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    });
  }
};

export const sendNotificationTestEmail = async ({
  recipientEmail,
  recipientDisplayName,
}: {
  recipientEmail: string;
  recipientDisplayName: string;
}) => {
  const text = [
    `Hi ${recipientDisplayName},`,
    "",
    "Your In-Accord email notifications are configured and this is a test message.",
    "",
    "If you received this, your notification mailer is working.",
  ].join("\n");

  const html = [
    `<p>Hi ${escapeHtml(recipientDisplayName)},</p>`,
    `<p>Your In-Accord email notifications are configured and this is a test message.</p>`,
    `<p>If you received this, your notification mailer is working.</p>`,
  ].join("");

  await sendEmail({
    to: recipientEmail,
    subject: "In-Accord test email",
    text,
    html,
  });
};