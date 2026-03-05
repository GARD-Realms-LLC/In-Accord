import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Hash, Headphones, MessageCircle, Mic, MoreVertical, Phone, Search, UserPlus, Video } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { SettingsButton } from "@/components/settings/settings-button";
import { UserAvatar } from "@/components/user-avatar";

const UsersPage = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const servers = await db
    .select({
      id: server.id,
      name: server.name,
      imageUrl: server.imageUrl,
      profileId: server.profileId,
      role: member.role,
    })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, profile.id))
    );

  const allServers = [...servers];

  const credentialResult = await db.execute(sql`
    select "createdAt", "updatedAt"
    from "LocalCredential"
    where "userId" = ${profile.id}
    limit 1
  `);

  const credentialRow = (credentialResult as unknown as {
    rows: Array<{
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    }>;
  }).rows?.[0];

  const profileJoinedAt = credentialRow?.createdAt
    ? new Date(credentialRow.createdAt).toISOString()
    : null;
  const profileLastLogonAt = credentialRow?.updatedAt
    ? new Date(credentialRow.updatedAt).toISOString()
    : null;

  return (
    <div className="h-full bg-[#313338] text-[#dbdee1]">
      <div className="grid h-full w-full grid-cols-[240px_1fr_260px] grid-rows-[1fr_auto] gap-2 p-2">

        <aside className="rounded-2xl border border-black/20 bg-[#2b2d31] p-2.5 shadow-xl shadow-black/35">
          <div className="flex h-full flex-col">
            <div>
              <div className="mb-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm font-semibold text-[#f2f3f5]">
                <div className="flex items-center justify-between">
                  <span>Find or start a conversation</span>
                  <Search className="h-4 w-4 text-[#949ba4]" />
                </div>
              </div>

              <nav className="mb-4 space-y-1">
                <button className="w-full rounded-md bg-[#404249] px-2.5 py-2 text-left text-sm font-medium text-white">
                  Friends
                </button>
                <button className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]">
                  Online
                </button>
                <button className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]">
                  All
                </button>
                <button className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]">
                  Pending
                </button>
                <button className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]">
                  Blocked
                </button>
                <button className="w-full rounded-md bg-[#248046] px-2.5 py-2 text-left text-sm font-semibold text-white hover:bg-[#1f8b4c]">
                  Add Friend
                </button>
              </nav>

              <div className="mt-4 rounded-md bg-[#1e1f22] p-3 text-xs text-[#949ba4]">
                Select a server from the far-left rail to jump into chat.
              </div>
            </div>
          </div>
        </aside>

        <div className="row-start-2 relative overflow-visible">
          <div className="relative z-[80] left-[calc(-88px-0.5rem)] w-[328px] rounded-[24px] border border-black/20 bg-[#232428] px-2 py-2 shadow-xl shadow-black/35">
          <div className="flex items-center justify-start rounded-[20px] bg-[#1e1f22] px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-4">
              <UserAvatar src={profile.imageUrl ?? undefined} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-[0.08em] text-[#949ba4]">
                  Users ID: {profile.id}
                </p>
                <p className="truncate text-xs font-semibold text-white">{profile.name || "User"}</p>
                <p className="truncate text-[10px] text-[#b5bac1]">Online</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1 text-[#b5bac1]">
              <button title="Mute" className="rounded p-1 hover:bg-[#3f4248]"><Mic className="h-3.5 w-3.5" /></button>
              <button title="Deafen" className="rounded p-1 hover:bg-[#3f4248]"><Headphones className="h-3.5 w-3.5" /></button>
              <SettingsButton
                profileId={profile.id}
                profileName={profile.name}
                profileEmail={profile.email}
                profileImageUrl={profile.imageUrl}
                profileJoinedAt={profileJoinedAt}
                profileLastLogonAt={profileLastLogonAt}
              />
            </div>
          </div>
          </div>
        </div>

        <main className="row-span-2 flex h-full flex-col rounded-2xl border border-black/20 bg-[#313338] overflow-hidden shadow-xl shadow-black/35">
          <header className="flex h-12 items-center justify-between border-b border-black/20 px-4">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-[#b5bac1]" />
              <span className="text-sm font-bold text-white">Friends</span>
              <span className="h-5 w-px bg-white/15" />
              <span className="rounded bg-[#3f4248] px-2 py-0.5 text-xs text-[#dcddde]">Online</span>
              <span className="rounded bg-[#3f4248] px-2 py-0.5 text-xs text-[#dcddde]">All</span>
              <span className="rounded bg-[#3f4248] px-2 py-0.5 text-xs text-[#dcddde]">Pending</span>
            </div>
            <div className="flex items-center gap-2 text-[#b5bac1]">
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Video className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Phone className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><UserPlus className="h-4 w-4" /></button>
            </div>
          </header>

          <section className="flex-1 overflow-auto p-3">
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              Joined Servers
            </p>
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.08em] text-[#949ba4]">
              Direct Messages — {allServers.length}
            </p>

            <div className="space-y-1">
              {allServers.map((item) => (
                <Link
                  key={item.id}
                  href={`/servers/${item.id}`}
                  className="group flex items-center justify-between rounded-md px-2 py-2 hover:bg-[#3a3d44]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#313338] bg-[#23a55a]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#f2f3f5]">{item.name}</p>
                      <p className="text-xs text-[#949ba4]">
                        {item.profileId === profile.id ? "Owned server" : `Joined • ${item.role}`}
                      </p>
                    </div>
                  </div>

                  <div className="hidden items-center gap-1 text-[#b5bac1] group-hover:flex">
                    <button className="rounded p-1 hover:bg-[#2b2d31]"><MessageCircle className="h-4 w-4" /></button>
                    <button className="rounded p-1 hover:bg-[#2b2d31]"><Hash className="h-4 w-4" /></button>
                    <button className="rounded p-1 hover:bg-[#2b2d31]"><MoreVertical className="h-4 w-4" /></button>
                  </div>
                </Link>
              ))}

              {allServers.length === 0 ? (
                <div className="rounded-md bg-[#2b2d31] px-3 py-4 text-sm text-[#b5bac1]">
                  No servers yet. Create one from the + button in the far-left rail.
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="row-span-2 rounded-2xl border border-black/20 bg-[#2b2d31] p-4 shadow-xl shadow-black/35">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#949ba4]">Active Now</h3>
          <div className="mt-4 rounded-lg bg-[#1e1f22] p-4 text-center">
            <p className="text-sm font-semibold text-white">It&apos;s quiet for now...</p>
            <p className="mt-2 text-xs text-[#b5bac1]">
              When activity picks up, it will appear here.
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-[#1e1f22] p-3 text-xs text-[#b5bac1]">
            Signed in as <span className="font-semibold text-[#f2f3f5]">{profile.name}</span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UsersPage;
