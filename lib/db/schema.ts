import { relations } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export enum MemberRole {
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
  GUEST = "GUEST",
}

export enum ChannelType {
  TEXT = "TEXT",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
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
] as const;

export const memberRoleEnum = pgEnum("MemberRole", memberRoleValues);
export const channelTypeEnum = pgEnum("ChannelType", channelTypeValues);

export const profile = pgTable("Users", {
  // Map profile.id used across the app to Users.userId in the shared live DB.
  id: varchar("userId", { length: 191 }).primaryKey(),
  // Keep legacy accessor shape available for existing code paths.
  userId: varchar("userId", { length: 191 }),
  name: varchar("name", { length: 191 }),
  imageUrl: text("avatarUrl"),
  email: varchar("email", { length: 191 }),
  createdAt: timestamp("account.created", { mode: "date" }),
  updatedAt: timestamp("lastLogin", { mode: "date" }),
}, (t) => ({
  userIdUnique: uniqueIndex("Users_userId_key").on(t.id),
}));

export const server = pgTable("Server", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  imageUrl: text("imageUrl").notNull(),
  inviteCode: varchar("inviteCode", { length: 191 }).notNull(),
  profileId: varchar("profileId", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
}, (t) => ({
  inviteCodeUnique: uniqueIndex("Server_inviteCode_key").on(t.inviteCode),
  profileIdIdx: index("Server_profileId_idx").on(t.profileId),
}));

export const member = pgTable("Member", {
  id: varchar("id", { length: 191 }).primaryKey(),
  role: memberRoleEnum("role").notNull(),
  profileId: varchar("profileId", { length: 191 }).notNull(),
  serverId: varchar("serverId", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
}, (t) => ({
  profileIdIdx: index("Member_profileId_idx").on(t.profileId),
  serverIdIdx: index("Member_serverId_idx").on(t.serverId),
}));

export const channel = pgTable("Channel", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  type: channelTypeEnum("type").notNull(),
  profileId: varchar("profileId", { length: 191 }).notNull(),
  serverId: varchar("serverId", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
}, (t) => ({
  profileIdIdx: index("Channel_profileId_idx").on(t.profileId),
  serverIdIdx: index("Channel_serverId_idx").on(t.serverId),
}));

export const message = pgTable("Message", {
  id: varchar("id", { length: 191 }).primaryKey(),
  content: text("content").notNull(),
  fileUrl: text("fileUrl"),
  memberId: varchar("memberId", { length: 191 }).notNull(),
  channelId: varchar("channelId", { length: 191 }).notNull(),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
}, (t) => ({
  memberIdIdx: index("Message_memberId_idx").on(t.memberId),
  channelIdIdx: index("Message_channelId_idx").on(t.channelId),
}));

export const conversation = pgTable("Conversation", {
  id: varchar("id", { length: 191 }).primaryKey(),
  memberOneId: varchar("memberOneId", { length: 191 }).notNull(),
  memberTwoId: varchar("memberTwoId", { length: 191 }).notNull(),
}, (t) => ({
  uniqueMembers: uniqueIndex("Conversation_memberOneId_memberTwoId_key").on(
    t.memberOneId,
    t.memberTwoId
  ),
  memberTwoIdIdx: index("Conversation_memberTwoId_idx").on(t.memberTwoId),
}));

export const directMessage = pgTable("DirectMessage", {
  id: varchar("id", { length: 191 }).primaryKey(),
  content: text("content").notNull(),
  fileUrl: text("fileUrl"),
  memberId: varchar("memberId", { length: 191 }).notNull(),
  conversationId: varchar("conversationId", { length: 191 }).notNull(),
  deleted: boolean("deleted").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
}, (t) => ({
  memberIdIdx: index("DirectMessage_memberId_idx").on(t.memberId),
  conversationIdIdx: index("DirectMessage_conversationId_idx").on(t.conversationId),
}));

export const profileRelations = relations(profile, ({ many }) => ({
  servers: many(server),
  members: many(member),
  channels: many(channel),
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
export type Server = typeof server.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Channel = typeof channel.$inferSelect;
export type Message = typeof message.$inferSelect;
export type Conversation = typeof conversation.$inferSelect;
export type DirectMessage = typeof directMessage.$inferSelect;
