"use client";

import { useEffect, useState } from "react";

import { DEFAULT_USER_TIMESTAMP_FORMAT, formatDateTimeForUser } from "@/lib/date-time-format";

interface UserLocalDateTimeProps {
  value: Date | string | number | null | undefined;
  fallback?: string;
  className?: string;
  options?: Intl.DateTimeFormatOptions;
}

export const UserLocalDateTime = ({
  value,
  fallback = "",
  className,
  options = DEFAULT_USER_TIMESTAMP_FORMAT,
}: UserLocalDateTimeProps) => {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    setLabel(formatDateTimeForUser(value, options, fallback));
  }, [fallback, options, value]);

  return <span className={className} suppressHydrationWarning>{label}</span>;
};
