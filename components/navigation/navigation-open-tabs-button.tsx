"use client";

import { usePathname, useRouter } from "next/navigation";

interface NavigationOpenTabsButtonProps {
  fallbackServerId?: string;
}

export const NavigationOpenTabsButton = ({ fallbackServerId }: NavigationOpenTabsButtonProps) => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="mb-2 mt-2 flex w-full justify-center px-2">
      <button
        type="button"
        onClick={() => {
          const jumpToTabsBar = () => {
            if (typeof window === "undefined") {
              return false;
            }

            const tabsBar = window.document.getElementById("server-tabs-bar");
            if (!tabsBar) {
              return false;
            }

            tabsBar.scrollIntoView({ behavior: "smooth", block: "start" });
            tabsBar.classList.add("ring-2", "ring-[#5865f2]/80");
            window.setTimeout(() => {
              tabsBar.classList.remove("ring-2", "ring-[#5865f2]/80");
            }, 850);
            return true;
          };

          if (pathname?.includes("/servers/")) {
            if (!jumpToTabsBar()) {
              window.location.hash = "server-tabs-bar";
            }
            return;
          }

          if (fallbackServerId) {
            router.push(`/servers/${fallbackServerId}#server-tabs-bar`);
          }
        }}
        className="inline-flex h-6 w-full max-w-23 items-center justify-center rounded-md border border-zinc-300/80 bg-zinc-200/70 px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-700 transition hover:bg-zinc-300/80 dark:border-zinc-600/80 dark:bg-zinc-700/50 dark:text-zinc-200 dark:hover:bg-zinc-600/70"
        title="Jump to Open Tabs bar"
        aria-label="Jump to Open Tabs bar"
      >
        Open Tabs
      </button>
    </div>
  );
};
