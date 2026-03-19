"use client";

import { useEffect, useMemo, useState } from "react";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);

export const UserLocalTime = () => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => (now ? formatDate(now) : "--"), [now]);
  const timeLabel = useMemo(() => (now ? formatTime(now) : "--:--:--"), [now]);

  return (
    <div className="w-full overflow-hidden rounded-[24px] border border-border bg-card px-3 py-2 text-center shadow-lg shadow-black/10 dark:shadow-black/25">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Local Time</p>
      <p className="truncate text-xs font-semibold tabular-nums text-foreground">{timeLabel}</p>
      <p className="truncate text-[10px] text-muted-foreground">{dateLabel}</p>
    </div>
  );
};
