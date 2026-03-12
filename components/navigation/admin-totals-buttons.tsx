"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [liveTotals, setLiveTotals] = useState({
    totalMembers,
    totalServers,
    openBugCount,
    openReportCount,
  });

  const refreshLiveTotals = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/totals", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "cache-control": "no-store",
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        totalMembers?: number;
        totalServers?: number;
        openBugCount?: number;
        openReportCount?: number;
      };

      setLiveTotals((current) => ({
        totalMembers: Number(payload.totalMembers ?? current.totalMembers),
        totalServers: Number(payload.totalServers ?? current.totalServers),
        openBugCount: Number(payload.openBugCount ?? current.openBugCount),
        openReportCount: Number(payload.openReportCount ?? current.openReportCount),
      }));
    } catch {
      // keep existing values if refresh fails
    }
  }, []);

  useEffect(() => {
    setLiveTotals({
      totalMembers,
      totalServers,
      openBugCount,
      openReportCount,
    });
  }, [openBugCount, openReportCount, totalMembers, totalServers]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) {
        return;
      }

      await refreshLiveTotals();
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const onAdminRefresh = () => {
      void refresh();
    };

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("inaccord:admin-totals-refresh", onAdminRefresh as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("inaccord:admin-totals-refresh", onAdminRefresh as EventListener);
    };
  }, [refreshLiveTotals]);

  const openAdminSection = (adminSection: "members" | "servers" | "issuesBugs" | "reported") => {
    void refreshLiveTotals();
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
    <div className="mx-auto w-full max-w-[120px] px-2 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-zinc-700 dark:text-zinc-300">
      <p className="mb-1">TOTALs</p>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => openAdminSection("members")}
          className="w-full rounded-md border border-emerald-900/70 bg-emerald-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition hover:bg-emerald-600 dark:border-emerald-900/80 dark:bg-emerald-800 dark:text-white dark:hover:bg-emerald-700"
        >
          Members: {liveTotals.totalMembers}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("servers")}
          className="w-full rounded-md border border-blue-900/70 bg-blue-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition hover:bg-blue-600 dark:border-blue-900/80 dark:bg-blue-800 dark:text-white dark:hover:bg-blue-700"
        >
          Servers: {liveTotals.totalServers}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("issuesBugs")}
          className="w-full rounded-md border border-amber-900/70 bg-amber-600 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition hover:bg-amber-500 dark:border-amber-900/80 dark:bg-amber-700 dark:text-white dark:hover:bg-amber-600"
        >
          Bugs: {liveTotals.openBugCount}
        </button>
        <button
          type="button"
          onClick={() => openAdminSection("reported")}
          className="w-full rounded-md border border-rose-900/70 bg-rose-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition hover:bg-rose-600 dark:border-rose-900/80 dark:bg-rose-800 dark:text-white dark:hover:bg-rose-700"
        >
          Reports: {liveTotals.openReportCount}
        </button>
      </div>
    </div>
  );
};
