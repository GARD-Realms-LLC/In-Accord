"use client";

import { useMemo, useState } from "react";

interface ServerRailShellProps {
  children: React.ReactNode;
  backgroundRail: React.ReactNode;
  sidebar: React.ReactNode;
  rightRail?: React.ReactNode;
  rightRailWidth?: number;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const BACKGROUND_RAIL_WIDTH = 6;
const LEFT_GLOBAL_RAIL_OFFSET = 72;

export const ServerRailShell = ({
  children,
  backgroundRail,
  sidebar,
  rightRail,
  rightRailWidth = 0,
  initialWidth = 300,
  minWidth = 240,
  maxWidth = 520,
}: ServerRailShellProps) => {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);

  const contentPaddingLeft = useMemo(
    () => BACKGROUND_RAIL_WIDTH + sidebarWidth,
    [sidebarWidth]
  );

  const onStartResize = (
    event: React.MouseEvent<HTMLButtonElement>,
    edge: "left" | "right"
  ) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const widthDelta = edge === "left" ? -delta : delta;
      const nextWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth + widthDelta)
      );
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="h-full">
      <div className="fixed inset-y-0 z-20 h-screen" style={{ left: LEFT_GLOBAL_RAIL_OFFSET }}>
        {backgroundRail}
      </div>

      <div
        className="fixed inset-y-0 z-20 h-screen"
        style={{
          left: LEFT_GLOBAL_RAIL_OFFSET + BACKGROUND_RAIL_WIDTH,
          width: sidebarWidth,
        }}
      >
        <div
          className="relative h-full border-l border-r border-black/30 shadow-[0_0_18px_rgba(0,0,0,0.35)]"
          style={{ width: sidebarWidth }}
        >
          <div className="h-full" style={{ width: sidebarWidth }}>
            {sidebar}
          </div>

          <button
            type="button"
            aria-label="Resize server sidebar"
            title="Resize sidebar (left edge)"
            onMouseDown={(event) => onStartResize(event, "left")}
            className="absolute inset-y-0 -left-1 z-30 w-2 cursor-col-resize bg-teal-500/15 hover:bg-teal-500/35"
          />

          <button
            type="button"
            aria-label="Resize server sidebar"
            title="Resize sidebar (right edge)"
            onMouseDown={(event) => onStartResize(event, "right")}
            className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize bg-teal-500/15 hover:bg-teal-500/35"
          />
        </div>
      </div>

      {rightRail ? (
        <div className="fixed inset-y-0 right-0 z-20 h-screen" style={{ width: rightRailWidth }}>
          {rightRail}
        </div>
      ) : null}

      <main
        className="h-full"
        style={{
          paddingLeft: contentPaddingLeft,
          paddingRight: rightRail ? rightRailWidth : 0,
        }}
      >
        {children}
      </main>
    </div>
  );
};
