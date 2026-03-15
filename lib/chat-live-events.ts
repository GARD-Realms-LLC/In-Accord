export const LOCAL_CHAT_MUTATION_EVENT = "inaccord:chat-mutated";

export type LocalChatMutationDetail = {
	scope: "channel" | "conversation";
	serverId?: string | null;
	channelId?: string | null;
	threadId?: string | null;
	conversationId?: string | null;
};

const normalizeId = (value: unknown) => {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : "";
};

const hasDirectMessageRoute = (value: string) => /\/direct-messages(?:\/|$)/i.test(value);

export const buildLocalChatMutationDetailFromRoute = (
	apiUrl: string,
	query?: Record<string, unknown> | null
): LocalChatMutationDetail | null => {
	const normalizedApiUrl = String(apiUrl ?? "").trim();
	const conversationId = normalizeId(query?.conversationId);
	const serverId = normalizeId(query?.serverId);
	const channelId = normalizeId(query?.channelId);
	const threadId = normalizeId(query?.threadId);

	if (conversationId || hasDirectMessageRoute(normalizedApiUrl)) {
		return {
			scope: "conversation",
			conversationId,
		};
	}

	if (!serverId || !channelId) {
		return null;
	}

	return {
		scope: "channel",
		serverId,
		channelId,
		threadId,
	};
};

export const emitLocalChatMutation = (detail: LocalChatMutationDetail | null | undefined) => {
	if (typeof window === "undefined" || !detail) {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<LocalChatMutationDetail>(LOCAL_CHAT_MUTATION_EVENT, {
			detail: {
				...detail,
				serverId: normalizeId(detail.serverId),
				channelId: normalizeId(detail.channelId),
				threadId: normalizeId(detail.threadId),
				conversationId: normalizeId(detail.conversationId),
			},
		})
	);
};

export const emitLocalChatMutationForRoute = (
	apiUrl: string,
	query?: Record<string, unknown> | null
) => {
	emitLocalChatMutation(buildLocalChatMutationDetailFromRoute(apiUrl, query));
};

export const matchesChannelMutation = (
	detail: LocalChatMutationDetail | null | undefined,
	expected: {
		serverId: string;
		channelId: string;
		threadId?: string | null;
	}
) => {
	if (!detail || detail.scope !== "channel") {
		return false;
	}

	return (
		normalizeId(detail.serverId) === normalizeId(expected.serverId) &&
		normalizeId(detail.channelId) === normalizeId(expected.channelId) &&
		normalizeId(detail.threadId) === normalizeId(expected.threadId)
	);
};

export const matchesConversationMutation = (
	detail: LocalChatMutationDetail | null | undefined,
	conversationId: string
) => {
	if (!detail || detail.scope !== "conversation") {
		return false;
	}

	return normalizeId(detail.conversationId) === normalizeId(conversationId);
};
