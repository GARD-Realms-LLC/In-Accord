export const LOCAL_CHAT_MUTATION_EVENT = "inaccord:chat-mutated";

export type LocalChatMutationProfile = {
	id: string;
	userId: string;
	name: string;
	imageUrl: string;
	email: string;
	role?: string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
};

export type LocalChatMutationMember = {
	id: string;
	role: string;
	profileId: string;
	serverId: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	profile: LocalChatMutationProfile;
};

export type LocalChatMutationMessage = {
	id: string;
	content: string;
	fileUrl: string | null;
	deleted: boolean;
	timestamp: string;
	isUpdated: boolean;
	clientMutationId?: string;
	member: LocalChatMutationMember;
};

export type LocalChatOptimisticMessage = {
	content: string;
	fileUrl: string | null;
};

export type LocalChatMutationDetail = {
	scope: "channel" | "conversation";
	serverId?: string | null;
	channelId?: string | null;
	threadId?: string | null;
	conversationId?: string | null;
	state?: "refresh" | "optimistic" | "confirmed" | "failed";
	clientMutationId?: string | null;
	optimisticMessage?: LocalChatOptimisticMessage | null;
	confirmedMessage?: LocalChatMutationMessage | null;
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
				state: detail.state ?? "refresh",
				clientMutationId: normalizeId(detail.clientMutationId),
			},
		})
	);
};

export const emitLocalChatMutationForRoute = (
	apiUrl: string,
	query?: Record<string, unknown> | null
) => {
	const baseDetail = buildLocalChatMutationDetailFromRoute(apiUrl, query);
	if (!baseDetail) {
		return;
	}

	emitLocalChatMutation({
		...baseDetail,
		state: "refresh",
	});
};

export const emitLocalChatOptimisticMessageForRoute = (
	apiUrl: string,
	query: Record<string, unknown> | null | undefined,
	options: {
		clientMutationId: string;
		content: string;
		fileUrl?: string | null;
	}
) => {
	const baseDetail = buildLocalChatMutationDetailFromRoute(apiUrl, query);
	if (!baseDetail) {
		return;
	}

	emitLocalChatMutation({
		...baseDetail,
		state: "optimistic",
		clientMutationId: options.clientMutationId,
		optimisticMessage: {
			content: String(options.content ?? ""),
			fileUrl: typeof options.fileUrl === "string" && options.fileUrl.trim().length > 0 ? options.fileUrl.trim() : null,
		},
	});
};

export const emitLocalChatConfirmedMessageForRoute = (
	apiUrl: string,
	query: Record<string, unknown> | null | undefined,
	options: {
		clientMutationId: string;
		message: LocalChatMutationMessage;
	}
) => {
	const baseDetail = buildLocalChatMutationDetailFromRoute(apiUrl, query);
	if (!baseDetail) {
		return;
	}

	emitLocalChatMutation({
		...baseDetail,
		state: "confirmed",
		clientMutationId: options.clientMutationId,
		confirmedMessage: options.message,
	});
};

export const emitLocalChatFailedMessageForRoute = (
	apiUrl: string,
	query: Record<string, unknown> | null | undefined,
	clientMutationId: string
) => {
	const baseDetail = buildLocalChatMutationDetailFromRoute(apiUrl, query);
	if (!baseDetail) {
		return;
	}

	emitLocalChatMutation({
		...baseDetail,
		state: "failed",
		clientMutationId,
	});
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
