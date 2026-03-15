"use client";

import { cn } from "@/lib/utils";
import { isNewUser } from "@/lib/is-new-user";

interface NewUserCloverBadgeProps {
  createdAt?: Date | string | null;
  className?: string;
}

export const NewUserCloverBadge = ({ createdAt, className }: NewUserCloverBadgeProps) => {
  if (!isNewUser(createdAt)) {
    return null;
  }

  return (
    <span
      className={cn("inline-flex items-center text-emerald-400", className)}
      aria-label="New user badge"
      title="New user"
    >
      🍀
    </span>
  );
};
