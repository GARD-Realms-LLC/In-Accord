import type { SVGProps } from "react";

export const ModeratorLineIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="9" cy="8" r="2.8" />
      <path d="M4.5 18c0-2.6 2-4.7 4.5-4.7S13.5 15.4 13.5 18" />
      <path d="M15.8 15.8l1.5 1.5 2.8-2.8" />
      <circle cx="17.8" cy="16.2" r="3.7" />
    </svg>
  );
};
