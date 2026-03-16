import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

type BannerImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
};

export const BannerImage = ({
  src,
  alt,
  className,
  style,
  loading = "lazy",
}: BannerImageProps) => {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      draggable={false}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      style={style}
    />
  );
};
