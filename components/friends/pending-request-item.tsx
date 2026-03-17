"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, UserPlus } from "lucide-react";

import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { UserAvatar } from "@/components/user-avatar";

interface PendingRequestItemProps {
  requestId: string;
  profileId?: string | null;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  avatarDecorationUrl?: string | null;
  isIncoming: boolean;
  isSpam?: boolean;
}

export const PendingRequestItem = ({
  requestId,
  profileId,
  displayName,
  email,
  imageUrl,
  avatarDecorationUrl,
  isIncoming,
  isSpam = false,
}: PendingRequestItemProps) => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAction = async (action: "accept" | "decline" | "cancel" | "block") => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const response = await fetch(`/api/friends/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update friend request.");
      }

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update friend request.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-md bg-muted/60 px-2 py-2"
      data-request-id={requestId}
    >
      <div className="flex items-center gap-2">
        <UserAvatar src={imageUrl ?? undefined} decorationSrc={avatarDecorationUrl} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            <ProfileNameWithServerTag
              name={displayName}
              profileId={profileId}
              containerClassName="w-full min-w-0"
              nameClassName="min-w-0 truncate text-xs text-[#dbdee1]"
              showNameplate
              nameplateSize="compact"
              stretchTagUnderPlate
            />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {email ?? "No email"} • {isIncoming ? "Incoming" : "Outgoing"}
            {isSpam ? " • Spam" : ""}
          </p>
        </div>

        <div className="ml-2 flex items-center gap-1">
          {isIncoming ? (
            <>
              <button
                type="button"
                onClick={() => handleAction("accept")}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Accept
              </button>
              <button
                type="button"
                onClick={() => handleAction("decline")}
                disabled={isSubmitting}
                className="rounded bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ignore
              </button>
              <button
                type="button"
                onClick={() => handleAction("block")}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 rounded bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                Block
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleAction("cancel")}
              disabled={isSubmitting}
              className="rounded bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {submitError ? (
        <p className="mt-2 text-xs text-destructive">{submitError}</p>
      ) : null}

      {isSubmitting ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Updating…</p>
      ) : null}
    </div>
  );
};
