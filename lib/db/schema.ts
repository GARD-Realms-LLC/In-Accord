import { relations } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const isoTimestamp = customType<{ data: Date; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return value.toISOString();
  },
  fromDriver(value) {
    return new Date(value);
  },
});

export enum MemberRole {
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
  GUEST = "GUEST",
}

export enum ChannelType {
  TEXT = "TEXT",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  ANNOUNCEMENT = "ANNOUNCEMENT",
}

export const memberRoleValues = [
  MemberRole.ADMIN,
  MemberRole.MODERATOR,
  MemberRole.GUEST,
] as const;
export const channelTypeValues = [
  ChannelType.TEXT,
  ChannelType.AUDIO,
  ChannelType.VIDEO,
  ChannelType.ANNOUNCEMENT,
] as const;

export const memberRoleEnum = () =>
  text({ enum: memberRoleValues }).$type<MemberRole>();
export const channelTypeEnum = () =>
  text({ enum: channelTypeValues }).$type<ChannelType>();

export const profile = sqliteTable("Users", {
  // Map profile.id used across the app to Users.userId in the shared live DB.
  id: text("userId").primaryKey(),
  // Keep legacy accessor shape available for existing code paths.
  userId: text("userId"),
  name: text("name"),
  imageUrl: text("avatarUrl"),
  email: text("email"),
  createdAt: isoTimestamp("account.created"),
  updatedAt: isoTimestamp("lastLogin"),
}, (t) => [
  uniqueIndex("Users_userId_key").on(t.id),
]);

export const localCredential = sqliteTable("LocalCredential", {
  userId: text("userId").primaryKey(),
  passwordHash: text("passwordHash").notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  index("LocalCredential_userId_idx").on(t.userId),
]);

export const server = sqliteTable("Server", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  imageUrl: text("imageUrl").notNull(),
  inviteCode: text("inviteCode").notNull(),
  profileId: text("profileId").notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  uniqueIndex("Server_inviteCode_key").on(t.inviteCode),
  index("Server_profileId_idx").on(t.profileId),
]);

export const member = sqliteTable("Member", {
  id: text("id").primaryKey(),
  role: text("role", { enum: memberRoleValues }).$type<MemberRole>().notNull(),
  profileId: text("profileId").notNull(),
  serverId: text("serverId").notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  index("Member_profileId_idx").on(t.profileId),
  index("Member_serverId_idx").on(t.serverId),
]);

export const channel = sqliteTable("Channel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  type: text("type", { enum: channelTypeValues }).$type<ChannelType>().notNull(),
  profileId: text("profileId").notNull(),
  serverId: text("serverId").notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  index("Channel_profileId_idx").on(t.profileId),
  index("Channel_serverId_idx").on(t.serverId),
]);

export const message = sqliteTable("Message", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  fileUrl: text("fileUrl"),
  memberId: text("memberId").notNull(),
  channelId: text("channelId").notNull(),
  threadId: text("threadId"),
  deleted: integer("deleted", { mode: "boolean" }).notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  index("Message_memberId_idx").on(t.memberId),
  index("Message_channelId_idx").on(t.channelId),
  index("Message_threadId_idx").on(t.threadId),
]);

export const conversation = sqliteTable("Conversation", {
  id: text("id").primaryKey(),
  memberOneId: text("memberOneId").notNull(),
  memberTwoId: text("memberTwoId").notNull(),
}, (t) => [
  uniqueIndex("Conversation_memberOneId_memberTwoId_key").on(
    t.memberOneId,
    t.memberTwoId,
  ),
  index("Conversation_memberTwoId_idx").on(t.memberTwoId),
]);

export const directMessage = sqliteTable("DirectMessage", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  fileUrl: text("fileUrl"),
  memberId: text("memberId").notNull(),
  conversationId: text("conversationId").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull(),
  createdAt: isoTimestamp("createdAt").notNull(),
  updatedAt: isoTimestamp("updatedAt").notNull(),
}, (t) => [
  index("DirectMessage_memberId_idx").on(t.memberId),
  index("DirectMessage_conversationId_idx").on(t.conversationId),
]);

export const profileRelations = relations(profile, ({ many }) => ({
  servers: many(server),
  members: many(member),
  channels: many(channel),
}));

export const localCredentialRelations = relations(localCredential, ({ one }) => ({
  profile: one(profile, { fields: [localCredential.userId], references: [profile.id] }),
}));

export const serverRelations = relations(server, ({ one, many }) => ({
  profile: one(profile, { fields: [server.profileId], references: [profile.id] }),
  members: many(member),
  channels: many(channel),
}));

export const memberRelations = relations(member, ({ one, many }) => ({
  profile: one(profile, { fields: [member.profileId], references: [profile.id] }),
  server: one(server, { fields: [member.serverId], references: [server.id] }),
  messages: many(message),
  directMessages: many(directMessage),
  conversationsInitiated: many(conversation, { relationName: "MemberOne" }),
  conversationsReceived: many(conversation, { relationName: "MemberTwo" }),
}));

export const channelRelations = relations(channel, ({ one, many }) => ({
  profile: one(profile, { fields: [channel.profileId], references: [profile.id] }),
  server: one(server, { fields: [channel.serverId], references: [server.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  member: one(member, { fields: [message.memberId], references: [member.id] }),
  channel: one(channel, { fields: [message.channelId], references: [channel.id] }),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  memberOne: one(member, {
    relationName: "MemberOne",
    fields: [conversation.memberOneId],
    references: [member.id],
  }),
  memberTwo: one(member, {
    relationName: "MemberTwo",
    fields: [conversation.memberTwoId],
    references: [member.id],
  }),
  directMessages: many(directMessage),
}));

export const directMessageRelations = relations(directMessage, ({ one }) => ({
  member: one(member, {
    fields: [directMessage.memberId],
    references: [member.id],
  }),
  conversation: one(conversation, {
    fields: [directMessage.conversationId],
    references: [conversation.id],
  }),
}));

export type Profile = typeof profile.$inferSelect;
export type LocalCredential = typeof localCredential.$inferSelect;
export type Server = typeof server.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Channel = typeof channel.$inferSelect;
export type Message = typeof message.$inferSelect;
export type Conversation = typeof conversation.$inferSelect;
export type DirectMessage = typeof directMessage.$inferSelect;
