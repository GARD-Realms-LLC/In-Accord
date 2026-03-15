"use client";

import { Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";

interface BusinessMemberIconProps {
  className?: string;
}

export const BusinessMemberIcon = ({ className }: BusinessMemberIconProps) => {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border border-indigo-400/35 bg-indigo-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-indigo-200",
        className
      )}
      aria-label="Business member"
      title="Business member"
    >
      <Briefcase className="h-3 w-3" />
      <span>Business</span>
    </span>
  );
};
