"use client";

import Link from "next/link";
import { Home } from "lucide-react";

export const NavigationUsersHomeButton = () => {
  return (
    <Link
      href="/users"
      className="group flex w-full items-center justify-center"
      title="Users Home"
      aria-label="Users Home"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600 ring-2 ring-green-300/80 transition-all group-hover:scale-105 dark:bg-green-500 dark:ring-green-200/80">
        <Home className="h-5 w-5 text-white" aria-hidden="true" suppressHydrationWarning />
      </div>
    </Link>
  );
};