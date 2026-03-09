"use client";

import { useModal } from "@/hooks/use-modal-store";

type AdminTotalsButtonsProps = {
  totalMembers: number;
  totalServers: number;
  openBugCount: number;
  openReportCount: number;
  profileId: string;
  profileName: string;
  profileRole: string;
  profileEmail: string;
  profileImageUrl: string;
};

export const AdminTotalsButtons = ({
  totalMembers,
  totalServers,
  openBugCount,
  openReportCount,
  profileId,
  profileName,
  profileRole,
  profileEmail,
  profileImageUrl,
}: AdminTotalsButtonsProps) => {
  const { onOpen } = useModal();

  const openAdminSection = (adminSection: "members" | "servers" | "issuesBugs" | "reported") => {
    onOpen("inAccordAdmin", {
      profileId,
      profileName,
      profileRole,
      profileEmail,
      profileImageUrl,
      query: {
        adminSection,
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[120px] px-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
      <p className="mb-1">TOTALs</p>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => openAdminSection("members")}
          className="w-full rounded-md border border-emerald-700/50 bg-emerald-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-950 transition hover:bg-emerald-400 dark:border-emerald-400/50 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
        >
          Members: {totalMembers}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("servers")}
          className="w-full rounded-md border border-blue-700/50 bg-blue-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-50 transition hover:bg-blue-400 dark:border-blue-300/60 dark:bg-blue-400 dark:text-blue-950 dark:hover:bg-blue-300"
        >
          Servers: {totalServers}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("issuesBugs")}
          className="w-full rounded-md border border-yellow-700/55 bg-yellow-400 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-yellow-950 transition hover:bg-yellow-300 dark:border-yellow-300/60 dark:bg-yellow-300 dark:text-yellow-950 dark:hover:bg-yellow-200"
        >
          Bugs: {openBugCount}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("reported")}
          className="w-full rounded-md border border-rose-700/55 bg-rose-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-50 transition hover:bg-rose-400 dark:border-rose-300/60 dark:bg-rose-400 dark:text-rose-950 dark:hover:bg-rose-300"
        >
          Reports: {openReportCount}
        </button>
      </div>
    </div>
  );
};
