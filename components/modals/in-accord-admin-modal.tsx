"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ServerProfilePopover } from "@/components/modals/server-profile-popover";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { cn } from "@/lib/utils";

type AdminSection = "general" | "members" | "servers" | "security" | "integrations";

type AdminUser = {
  id: string;
  userId: string;
  name: string;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string;
  email: string;
  role: string;
  imageUrl: string;
  joinedAt: string | null;
  lastLogin: string | null;
  ownedServerCount: number;
  joinedServerCount: number;
};

type AdminServer = {
  id: string;
  name: string;
  imageUrl: string;
  bannerUrl: string | null;
  inviteCode: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string | null;
  updatedAt: string | null;
  memberCount: number;
  channelCount: number;
};

export const InAccordAdminModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const [activeSection, setActiveSection] = useState<AdminSection>("general");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("ALL");
  const [serverSearch, setServerSearch] = useState("");
  const [serverOwnerFilter, setServerOwnerFilter] = useState("ALL");
  const [columnWidths, setColumnWidths] = useState([320, 210, 140, 220, 100, 100]);
  const [serverColumnWidths, setServerColumnWidths] = useState([240, 220, 220, 180, 110, 110]);

  const isModalOpen = isOpen && type === "inAccordAdmin";

  useEffect(() => {
    if (!isModalOpen || activeSection !== "members") {
      return;
    }

    let isCancelled = false;

    const loadUsers = async () => {
      try {
        setIsLoadingUsers(true);
        setUsersError(null);

        const response = await fetch("/api/admin/users", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load users (${response.status})`);
        }

        const payload = (await response.json()) as { users?: AdminUser[] };
        if (!isCancelled) {
          setUsers(payload.users ?? []);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[IN_ACCORD_ADMIN_USERS_LOAD]", error);
          setUsersError("Unable to load users right now.");
          setUsers([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingUsers(false);
        }
      }
    };

    loadUsers();

    return () => {
      isCancelled = true;
    };
  }, [activeSection, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "servers") {
      return;
    }

    let isCancelled = false;

    const loadServers = async () => {
      try {
        setIsLoadingServers(true);
        setServersError(null);

        const response = await fetch("/api/admin/servers", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load servers (${response.status})`);
        }

        const payload = (await response.json()) as { servers?: AdminServer[] };
        if (!isCancelled) {
          setServers(payload.servers ?? []);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[IN_ACCORD_ADMIN_SERVERS_LOAD]", error);
          setServersError("Unable to load servers right now.");
          setServers([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingServers(false);
        }
      }
    };

    loadServers();

    return () => {
      isCancelled = true;
    };
  }, [activeSection, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      setActiveSection("general");
      setUsers([]);
      setUsersError(null);
      setIsLoadingUsers(false);
      setMemberSearch("");
      setMemberRoleFilter("ALL");
      setServers([]);
      setServersError(null);
      setIsLoadingServers(false);
      setServerSearch("");
      setServerOwnerFilter("ALL");
      setColumnWidths([320, 210, 140, 220, 100, 100]);
      setServerColumnWidths([240, 220, 220, 180, 110, 110]);
    }
  }, [isModalOpen]);

  const minColumnWidths = [200, 140, 100, 160, 80, 80];

  const gridTemplateColumns = useMemo(
    () => columnWidths.map((width) => `${width}px`).join(" "),
    [columnWidths]
  );

  const startColumnResize = (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidths = [...columnWidths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidths = [...startWidths];
      nextWidths[index] = Math.max(minColumnWidths[index], startWidths[index] + delta);
      setColumnWidths(nextWidths);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const minServerColumnWidths = [180, 180, 170, 130, 80, 80];

  const serverGridTemplateColumns = useMemo(
    () => serverColumnWidths.map((width) => `${width}px`).join(" "),
    [serverColumnWidths]
  );

  const startServerColumnResize = (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidths = [...serverColumnWidths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidths = [...startWidths];
      nextWidths[index] = Math.max(minServerColumnWidths[index], startWidths[index] + delta);
      setServerColumnWidths(nextWidths);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatches =
        memberRoleFilter === "ALL" || (user.role || "USER").toUpperCase() === memberRoleFilter;

      if (!query) {
        return roleMatches;
      }

      const haystack = [user.name, user.email, user.userId, user.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return roleMatches && haystack.includes(query);
    });
  }, [memberRoleFilter, memberSearch, users]);

  const roleOptions = useMemo(() => {
    const uniqueRoles = Array.from(new Set(users.map((user) => (user.role || "USER").toUpperCase())));
    return ["ALL", ...uniqueRoles.sort()];
  }, [users]);

  const hasActiveMemberFilters = memberSearch.trim().length > 0 || memberRoleFilter !== "ALL";

  const ownerOptions = useMemo(() => {
    const uniqueOwners = Array.from(
      new Set(servers.map((server) => (server.ownerName || "Unknown Owner").trim()))
    ).filter(Boolean);
    return ["ALL", ...uniqueOwners.sort((a, b) => a.localeCompare(b))];
  }, [servers]);

  const filteredServers = useMemo(() => {
    const query = serverSearch.trim().toLowerCase();

    return servers.filter((server) => {
      const ownerMatches =
        serverOwnerFilter === "ALL" || (server.ownerName || "Unknown Owner") === serverOwnerFilter;

      if (!query) {
        return ownerMatches;
      }

      const haystack = [
        server.id,
        server.name,
        server.ownerName,
        server.ownerEmail,
        server.inviteCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return ownerMatches && haystack.includes(query);
    });
  }, [serverOwnerFilter, serverSearch, servers]);

  const hasActiveServerFilters = serverSearch.trim().length > 0 || serverOwnerFilter !== "ALL";

  const menuButtonClass = (section: AdminSection) =>
    cn(
      "w-full rounded-md px-3 py-2 text-left text-sm transition",
      activeSection === section
        ? "bg-indigo-500/15 font-medium text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-200"
        : "text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
    );

  const formatDateTime = (value: string | null) => {
    if (!value) {
      return "N/A";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "N/A";
    }

    return parsed.toLocaleString();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            In-Accord Administrator Panel
          </DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-300">
            Administration for In-Accord administrators area.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
          <aside className="border-r border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Admin Menu
            </p>
            <nav className="mt-3 space-y-1">
              <button type="button" onClick={() => setActiveSection("general")} className={menuButtonClass("general")}>
                General Settings
              </button>
              <button type="button" onClick={() => setActiveSection("members")} className={menuButtonClass("members")}>
                Members & Roles
              </button>
              <button type="button" onClick={() => setActiveSection("servers")} className={menuButtonClass("servers")}>
                Servers
              </button>
              <button type="button" onClick={() => setActiveSection("security")} className={menuButtonClass("security")}>
                Security & Audit
              </button>
              <button type="button" onClick={() => setActiveSection("integrations")} className={menuButtonClass("integrations")}>
                Integrations
              </button>
            </nav>
          </aside>

          <section className="min-h-0 space-y-4 overflow-y-auto p-6">
            {activeSection === "general" && (
              <>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">Access Status</p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-amber-200">
                    <ShieldCheck className="h-4 w-4" />
                    Administrator access confirmed for {data.profileName || "current user"}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                  <p className="font-semibold">Profile Context</p>
                  <p className="mt-1">User ID: {data.profileId || "N/A"}</p>
                  <p>Email: {data.profileEmail || "N/A"}</p>
                  <p>Role: {data.profileRole || "Administrator"}</p>
                </div>
              </>
            )}

            {activeSection === "members" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Users</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {filteredUsers.length}
                  </span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search by name, email, user ID, or role"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />
                  <select
                    value={memberRoleFilter}
                    onChange={(event) => setMemberRoleFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role === "ALL" ? "All roles" : role}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setMemberSearch("");
                      setMemberRoleFilter("ALL");
                    }}
                    disabled={!hasActiveMemberFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {isLoadingUsers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading users...</p>
                ) : usersError ? (
                  <p className="text-sm text-rose-500">{usersError}</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    No users found{hasActiveMemberFilters ? " for the current filters" : ""}.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="overflow-x-auto">
                      <div className="min-w-max">
                        <div
                          className="grid gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          style={{ gridTemplateColumns }}
                        >
                          <div className="relative pr-2">
                            <p>user_id</p>
                            <button
                              type="button"
                              aria-label="Resize user_id column"
                              onMouseDown={(event) => startColumnResize(0, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>name</p>
                            <button
                              type="button"
                              aria-label="Resize name column"
                              onMouseDown={(event) => startColumnResize(1, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>role</p>
                            <button
                              type="button"
                              aria-label="Resize role column"
                              onMouseDown={(event) => startColumnResize(2, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>joined_at</p>
                            <button
                              type="button"
                              aria-label="Resize joined_at column"
                              onMouseDown={(event) => startColumnResize(3, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>owned</p>
                            <button
                              type="button"
                              aria-label="Resize owned column"
                              onMouseDown={(event) => startColumnResize(4, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <p>joined</p>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto bg-white/70 font-mono text-[12pt] leading-none text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                          {filteredUsers.map((user, index) => (
                            (() => {
                              const normalizedPresenceStatus = normalizePresenceStatus(user.presenceStatus);
                              return (
                            <div
                              key={user.id}
                              className={cn(
                                "grid gap-2 px-3 py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                              style={{ gridTemplateColumns }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                      aria-label={`Open profile for ${user.name}`}
                                      title={`View ${user.name} profile`}
                                    >
                                      <UserAvatar src={user.imageUrl} className="h-5 w-5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    side="right"
                                    align="start"
                                    className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
                                  >
                                    <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                                      {user.bannerUrl ? (
                                        <Image
                                          src={user.bannerUrl}
                                          alt="User banner"
                                          fill
                                          className="object-cover"
                                          unoptimized
                                        />
                                      ) : null}
                                    </div>

                                    <div className="relative p-3 pt-7">
                                      <div className="absolute -top-5 left-3 rounded-full border-4 border-[#111214]">
                                        <UserAvatar src={user.imageUrl} className="h-10 w-10" />
                                      </div>

                                      <p className="truncate text-base font-bold text-white">{user.profileName || user.name}</p>
                                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

                                      <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                                        <div className="space-y-1 text-[#dbdee1]">
                                          <p>In-Accord User ID: {user.userId}</p>
                                          <p>Name: {user.name}</p>
                                          <p>Profile Name: {user.profileName || "Not set"}</p>
                                          <p>Status: {presenceStatusLabelMap[normalizedPresenceStatus]}</p>
                                          <p>Role: {user.role || "USER"}</p>
                                          <p>Joined: {formatDateTime(user.joinedAt)}</p>
                                          <p>Last Login: {formatDateTime(user.lastLogin)}</p>
                                          <p>Owned Servers: {user.ownedServerCount}</p>
                                          <p>Joined Servers: {user.joinedServerCount}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <p className="truncate text-[12pt] leading-none" title={user.userId}>{user.userId}</p>
                              </div>
                              <p className="truncate" title={user.name}>{user.name}</p>
                              <p className="truncate uppercase" title={user.role || "USER"}>{user.role || "USER"}</p>
                              <p className="truncate" title={formatDateTime(user.joinedAt)}>{formatDateTime(user.joinedAt)}</p>
                              <p>{user.ownedServerCount}</p>
                              <p>{user.joinedServerCount}</p>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "servers" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Servers</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {filteredServers.length}
                  </span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <input
                    type="text"
                    value={serverSearch}
                    onChange={(event) => setServerSearch(event.target.value)}
                    placeholder="Search by server name, ID, invite code, owner"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />

                  <select
                    value={serverOwnerFilter}
                    onChange={(event) => setServerOwnerFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner === "ALL" ? "All owners" : owner}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setServerSearch("");
                      setServerOwnerFilter("ALL");
                    }}
                    disabled={!hasActiveServerFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {isLoadingServers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading servers...</p>
                ) : serversError ? (
                  <p className="text-sm text-rose-500">{serversError}</p>
                ) : filteredServers.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    No servers found{hasActiveServerFilters ? " for the current filters" : ""}.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="overflow-x-auto">
                      <div className="min-w-max">
                        <div
                          className="grid gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          style={{ gridTemplateColumns: serverGridTemplateColumns }}
                        >
                          <div className="relative pr-2">
                            <p>server_id</p>
                            <button
                              type="button"
                              aria-label="Resize server_id column"
                              onMouseDown={(event) => startServerColumnResize(0, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>name</p>
                            <button
                              type="button"
                              aria-label="Resize name column"
                              onMouseDown={(event) => startServerColumnResize(1, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>owner</p>
                            <button
                              type="button"
                              aria-label="Resize owner column"
                              onMouseDown={(event) => startServerColumnResize(2, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>created_at</p>
                            <button
                              type="button"
                              aria-label="Resize created_at column"
                              onMouseDown={(event) => startServerColumnResize(3, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>members</p>
                            <button
                              type="button"
                              aria-label="Resize members column"
                              onMouseDown={(event) => startServerColumnResize(4, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <p>channels</p>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto bg-white/70 font-mono text-[12pt] leading-none text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                          {filteredServers.map((serverItem) => (
                            <div
                              key={serverItem.id}
                              className="grid gap-2 border-b border-zinc-200/80 bg-white/85 px-3 py-2 text-zinc-900 transition-colors hover:bg-indigo-50/70 last:border-b-0 dark:border-zinc-800 dark:bg-zinc-950/35 dark:text-zinc-100 dark:hover:bg-zinc-800/55"
                              style={{ gridTemplateColumns: serverGridTemplateColumns }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ServerProfilePopover server={serverItem} />
                                <p className="truncate text-[12pt] leading-none" title={serverItem.id}>{serverItem.id}</p>
                              </div>
                              <p className="truncate" title={serverItem.name}>{serverItem.name}</p>
                              <p className="truncate" title={`${serverItem.ownerName}${serverItem.ownerEmail ? ` (${serverItem.ownerEmail})` : ""}`}>
                                {serverItem.ownerName}
                              </p>
                              <p className="truncate" title={formatDateTime(serverItem.createdAt)}>{formatDateTime(serverItem.createdAt)}</p>
                              <p>{serverItem.memberCount}</p>
                              <p>{serverItem.channelCount}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "security" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                Security and audit controls will be available here.
              </div>
            )}

            {activeSection === "integrations" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                Integration settings will be available here.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
