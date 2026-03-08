import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string;
  decorationSrc?: string | null;
  className?: string;
}

export const UserAvatar = ({ src, decorationSrc, className }: UserAvatarProps) => {
  return (
    <span className="relative inline-flex">
      <Avatar className={cn("h-7 w-7 md:h-10 md:w-10", className)}>
        <AvatarImage src={src} />
      </Avatar>

      {decorationSrc ? (
        <span className="pointer-events-none absolute -inset-[18%] z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={decorationSrc}
            alt="Avatar decoration"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </span>
      ) : null}
    </span>
  );
};
