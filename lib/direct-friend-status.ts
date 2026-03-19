export type DirectFriendStatus =
  | "self"
  | "friends"
  | "incoming_pending"
  | "outgoing_pending"
  | "not_friends";

export type FriendRequestDirection = "incoming" | "outgoing";

export type FriendRequestPostResponse = {
  ok?: boolean;
  status?: "accepted" | "pending";
  requestId?: string;
  isIncoming?: boolean;
  direction?: FriendRequestDirection;
  created?: boolean;
};

export const isDirectFriendStatus = (
  value: unknown,
): value is DirectFriendStatus =>
  value === "self" ||
  value === "friends" ||
  value === "incoming_pending" ||
  value === "outgoing_pending" ||
  value === "not_friends";

export const normalizeDirectFriendStatus = (
  value: unknown,
  fallback: DirectFriendStatus = "not_friends",
): DirectFriendStatus => (isDirectFriendStatus(value) ? value : fallback);

export const getDirectFriendRelationshipLabel = (
  status: DirectFriendStatus,
) => {
  switch (status) {
    case "self":
      return "This is you";
    case "friends":
      return "Direct friends";
    case "incoming_pending":
      return "Incoming friend request";
    case "outgoing_pending":
      return "Outgoing friend request";
    case "not_friends":
    default:
      return "Not direct friends";
  }
};

export const getDirectFriendStatusFromRequestResponse = (
  response: FriendRequestPostResponse | null | undefined,
): DirectFriendStatus | null => {
  if (response?.status === "accepted") {
    return "friends";
  }

  if (response?.direction === "incoming" || response?.isIncoming) {
    return "incoming_pending";
  }

  if (response?.status === "pending") {
    return "outgoing_pending";
  }

  return null;
};
