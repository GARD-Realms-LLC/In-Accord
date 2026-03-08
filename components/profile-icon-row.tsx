import { cn } from "@/lib/utils";
import type { ProfileIcon } from "@/lib/profile-icons";

interface ProfileIconRowProps {
  icons?: ProfileIcon[] | null;
  className?: string;
}

export const ProfileIconRow = ({ icons, className }: ProfileIconRowProps) => {
  const items = Array.isArray(icons) ? icons : [];

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("mb-1 flex flex-wrap items-center gap-1.5", className)}>
      {items.map((icon) => (
        <span
          key={icon.key}
          className="inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]"
          title={icon.label}
          aria-label={icon.label}
        >
          {icon.emoji ? <span>{icon.emoji}</span> : null}
          <span>{icon.shortLabel}</span>
        </span>
      ))}
    </div>
  );
};
