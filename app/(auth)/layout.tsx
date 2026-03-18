"use client";

import {
  AtSign,
  Bell,
  Hash,
  MessageCircle,
  Phone,
  Radio,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const socialSteampunkGlyphs: LucideIcon[] = [
  MessageCircle,
  Users,
  Hash,
  AtSign,
  Send,
  Bell,
  Phone,
  Radio,
];

const steampunkSocialIcons = Array.from({ length: 34 }, (_, index) => {
  const spinPattern = index % 5;

  return {
    key: `social-steampunk-${index}`,
    Icon: socialSteampunkGlyphs[index % socialSteampunkGlyphs.length],
    left: `${5 + ((index * 19) % 88)}%`,
    top: `${6 + ((index * 13) % 84)}%`,
    size: 16 + (index % 5) * 4,
    rotation: -18 + (index % 9) * 4,
    delay: `${(index % 8) * 0.9}s`,
    duration: `${10 + (index % 7) * 1.4}s`,
    spinDuration: `${6 + (index % 6) * 1.1}s`,
    pulseDuration: `${2.8 + (index % 5) * 0.4}s`,
    floatDistance: `${6 + (index % 4) * 2}px`,
    spinDirection: index % 2 === 0 ? "reverse" : "normal",
    spinPlayState: spinPattern === 1 || spinPattern === 3 ? "running" : "paused",
    opacity: 0.54 + (index % 4) * 0.1,
  };
});

const patronRainDrops = Array.from({ length: 24 }, (_, index) => ({
  key: `patron-rain-${index}`,
  left: `${4 + (index % 8) * 11.5}%`,
  delay: `${(index % 9) * 0.85}s`,
  duration: `${7.2 + (index % 6) * 1.1}s`,
  opacity: 0.24 + (index % 5) * 0.1,
  scale: 0.68 + (index % 6) * 0.07,
  width: `${10 + (index % 3) * 2}px`,
  height: `${28 + (index % 4) * 6}px`,
  background:
    index % 3 === 0
      ? "linear-gradient(180deg, rgba(250, 204, 21, 0.1) 0%, rgba(234, 179, 8, 0.68) 100%)"
      : index % 3 === 1
        ? "linear-gradient(180deg, rgba(196, 181, 253, 0.08) 0%, rgba(139, 92, 246, 0.64) 100%)"
        : "linear-gradient(180deg, rgba(125, 211, 252, 0.08) 0%, rgba(56, 189, 248, 0.62) 100%)",
  boxShadow:
    index % 3 === 0
      ? "0 0 0 1px rgba(250, 204, 21, 0.2), 0 0 14px rgba(234, 179, 8, 0.4)"
      : index % 3 === 1
        ? "0 0 0 1px rgba(196, 181, 253, 0.2), 0 0 14px rgba(139, 92, 246, 0.38)"
        : "0 0 0 1px rgba(125, 211, 252, 0.18), 0 0 14px rgba(56, 189, 248, 0.35)",
}));

const patronSparkles = Array.from({ length: 14 }, (_, index) => ({
  key: `patron-sparkle-${index}`,
  left: `${8 + (index % 7) * 12}%`,
  top: `${4 + (index % 10) * 9}%`,
  delay: `${(index % 8) * 0.7}s`,
  duration: `${2.6 + (index % 5) * 0.5}s`,
  opacity: 0.2 + (index % 4) * 0.12,
  scale: 0.8 + (index % 4) * 0.1,
}));

const AuthLayout = ({ children }: { children: ReactNode }) => {
  const rosterContainerRef = useRef<HTMLDivElement | null>(null);
  const rosterTrackRef = useRef<HTMLDivElement | null>(null);
  const [isClientDecorReady, setIsClientDecorReady] = useState(false);
  const [rosterStartOffset, setRosterStartOffset] = useState(0);
  const [rosterEndOffset, setRosterEndOffset] = useState(0);
  const [rosterDurationSeconds, setRosterDurationSeconds] = useState(28);
  const [isRosterReady, setIsRosterReady] = useState(false);
  const featuredPatrons = [
    "ClockworkCass",
    "BrassBeacon",
    "SteamSparrow",
    "CopperComet",
    "AetherArc",
    "GuildedSignal",
    "ValveViolet",
    "IronQuill",
    "Cogline",
    "BoilerBelle",
    "LumenLatch",
    "RivetRaven",
  ];

  useEffect(() => {
    setIsClientDecorReady(true);
  }, []);

  useEffect(() => {
    const container = rosterContainerRef.current;
    const track = rosterTrackRef.current;
    if (!isClientDecorReady || !container || !track) {
      return;
    }

    const measure = () => {
      const containerHeight = container.clientHeight;
      const trackHeight = track.scrollHeight;
      const nextStartOffset = containerHeight - trackHeight;
      const nextEndOffset = -trackHeight;

      setRosterStartOffset(nextStartOffset);
      setRosterEndOffset(nextEndOffset);
      setRosterDurationSeconds(Math.max(32, Math.round(trackHeight / 7.5)));
      setIsRosterReady(true);
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);
    observer.observe(track);

    return () => {
      observer.disconnect();
    };
  }, [featuredPatrons.length, isClientDecorReady]);

  return (
    <div className="relative grid min-h-screen w-full grid-cols-[minmax(0,1fr)_auto] overflow-hidden bg-[#0f1115] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(88,101,242,0.28),transparent_38%),radial-gradient(circle_at_82%_14%,rgba(56,189,248,0.2),transparent_36%),linear-gradient(140deg,#0b0d12_0%,#111827_42%,#1f2937_100%)]"
      />

      {isClientDecorReady ? (
        <div aria-hidden className="auth-steampunk-social-layer pointer-events-none absolute inset-y-0 left-0 right-24 z-5 sm:right-32">
          {steampunkSocialIcons.map((item) => (
            <span
              key={item.key}
              className="auth-steampunk-social-glyph"
              style={{
                left: item.left,
                top: item.top,
                opacity: item.opacity,
                ["--social-glyph-duration" as any]: item.duration,
                ["--social-spin-duration" as any]: item.spinDuration,
                ["--social-pulse-duration" as any]: item.pulseDuration,
                ["--social-float-distance" as any]: item.floatDistance,
                ["--social-spin-direction" as any]: item.spinDirection,
                ["--social-spin-play-state" as any]: item.spinPlayState,
                animationDelay: item.delay,
                transform: `rotate(${item.rotation}deg)`,
              }}
            >
              <span className="auth-steampunk-social-gear">
                <span className="auth-steampunk-social-gear-hub" />
              </span>
              <item.Icon className="auth-steampunk-social-icon" style={{ width: `${item.size}px`, height: `${item.size}px` }} />
            </span>
          ))}
        </div>
      ) : null}

      <main className="relative z-10 col-start-1 flex min-h-screen min-w-0 items-center justify-center px-4 py-6 md:px-8 md:py-10">
        {children}
      </main>

      <aside
        className="relative z-10 flex min-h-screen w-24 flex-col overflow-hidden border-l border-black/30 bg-[#0d0f14]/65 sm:w-32"
        style={{ ["--auth-patron-intensity" as any]: 1, ["--auth-patron-speed" as any]: 1 }}
      >
        <div className="relative z-20 border-b border-amber-300/25 bg-[#0d0f14]/78 px-3 py-3 backdrop-blur-md">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/95">
            Our Patrons
          </p>
          <p className="mt-1 text-center text-[10px] text-amber-100/70">
            {featuredPatrons.length} Featured Supporters
          </p>
        </div>

        <div
          ref={rosterContainerRef}
          className="auth-patron-roster relative z-20 min-h-0 flex-1 border-b border-amber-300/20 bg-[#0d0f14]/55 px-2 py-2 backdrop-blur-sm"
        >
          <div
            ref={rosterTrackRef}
            className="auth-patron-roster-track"
            style={{
              ["--roster-start-offset" as any]: `${rosterStartOffset}px`,
              ["--roster-end-offset" as any]: `${rosterEndOffset}px`,
              ["--roster-scroll-duration" as any]: `${rosterDurationSeconds}s`,
              ["--roster-scroll-play-state" as any]: isRosterReady ? "running" : "paused",
            }}
          >
            {featuredPatrons.map((name, index) => (
              <p
                key={`patron-name-${name}-${index}`}
                className="truncate rounded-md border border-amber-200/15 bg-amber-300/10 px-2 py-1 text-center text-[10px] font-medium text-amber-100/90"
                title={name}
              >
                {name}
              </p>
            ))}
          </div>
        </div>

        {isClientDecorReady ? (
          <div className="pointer-events-none absolute inset-0">
            {patronRainDrops.map((drop) => (
              <span
                key={drop.key}
                className="auth-patron-rain-drop"
                style={{
                  left: drop.left,
                  animationDelay: drop.delay,
                  ["--rain-duration" as any]: drop.duration,
                  ["--drop-opacity" as any]: String(drop.opacity),
                  width: drop.width,
                  height: drop.height,
                  background: drop.background,
                  boxShadow: drop.boxShadow,
                  transform: `scale(${drop.scale})`,
                }}
              />
            ))}

            {patronSparkles.map((sparkle) => (
              <span
                key={sparkle.key}
                className="auth-patron-rain-sparkle"
                style={{
                  left: sparkle.left,
                  top: sparkle.top,
                  animationDelay: sparkle.delay,
                  ["--sparkle-duration" as any]: sparkle.duration,
                  ["--sparkle-opacity" as any]: String(sparkle.opacity),
                  transform: `scale(${sparkle.scale})`,
                }}
              />
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
};

export default AuthLayout;