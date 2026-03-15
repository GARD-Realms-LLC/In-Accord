"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type NameplatePillProps = {
  label?: string | null;
  subtitle?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  size?: "compact" | "default";
  className?: string;
  labelClassName?: string;
  metaContent?: ReactNode;
};

const normalizeColor = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : "#5865f2";
};

const toRgb = (hex: string) => {
  const normalized = hex.trim().replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;

  const parsed = Number.parseInt(full, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;

  return { r, g, b };
};

export const NameplatePill = ({
  label,
  subtitle,
  color,
  imageUrl,
  size = "default",
  className,
  labelClassName,
  metaContent,
}: NameplatePillProps) => {
  const trimmedLabel = String(label ?? "").trim();
  const trimmedSubtitle = String(subtitle ?? "").trim();

  if (!trimmedLabel) {
    return null;
  }

  const resolvedColor = normalizeColor(color);
  const { r, g, b } = toRgb(resolvedColor);
  const resolvedImageUrl = String(imageUrl ?? "").trim();

  return (
    <span
      className={cn(
        trimmedSubtitle
          ? size === "compact"
            ? "relative inline-flex min-h-9 max-w-full items-stretch overflow-hidden rounded-[4px] border text-[11px] font-medium leading-tight text-[#f2f3f5]"
            : "relative inline-flex min-h-11 max-w-full items-stretch overflow-hidden rounded-[4px] border text-[11px] font-medium leading-tight text-[#f2f3f5]"
          : size === "compact"
            ? "relative inline-flex min-h-5 max-w-full items-center overflow-hidden rounded-[4px] border text-[11px] font-medium leading-tight text-[#f2f3f5]"
            : "relative inline-flex min-h-7 max-w-full items-center overflow-hidden rounded-[4px] border text-[11px] font-medium leading-tight text-[#f2f3f5]",
        className
      )}
      style={{
        borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
        ...(resolvedImageUrl
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.36)), url("${resolvedImageUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}),
      }}
      title={`Nameplate: ${trimmedLabel}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: resolvedColor }}
      />
      <span
        className={cn(
          "relative min-w-0 flex-1 px-2",
          trimmedSubtitle ? (size === "compact" ? "py-1" : "py-1.5") : size === "compact" ? "py-0.5" : "py-1"
        )}
      >
        <span className={cn("block truncate", labelClassName)}>{trimmedLabel}</span>
        {trimmedSubtitle ? (
          <span className="mt-0.5 block truncate text-[10px] leading-tight font-medium text-[#c8ccd1]">{trimmedSubtitle}</span>
        ) : null}
      </span>
      {metaContent ? (
        <span className="relative mr-1 inline-flex h-full items-center gap-1 border-l border-white/20 pl-1.5">
          {metaContent}
        </span>
      ) : null}
    </span>
  );
};
