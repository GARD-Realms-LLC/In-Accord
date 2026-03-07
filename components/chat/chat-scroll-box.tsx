"use client";

import { useEffect, useRef } from "react";

type ChatScrollBoxProps = {
  className?: string;
  scrollKey?: string | number;
  stickToBottomOffset?: number;
  children: React.ReactNode;
};

export const ChatScrollBox = ({
  className,
  scrollKey,
  stickToBottomOffset = 120,
  children,
}: ChatScrollBoxProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const isNearBottom = (container: HTMLDivElement, offset: number) => {
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    return remaining <= offset;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    shouldStickToBottomRef.current = true;
    scrollToBottom();
    const raf = window.requestAnimationFrame(scrollToBottom);
    const timer = window.setTimeout(scrollToBottom, 60);

    const onScroll = () => {
      shouldStickToBottomRef.current = isNearBottom(container, stickToBottomOffset);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [stickToBottomOffset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (!shouldStickToBottomRef.current) {
      return;
    }

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    scrollToBottom();
    const raf = window.requestAnimationFrame(scrollToBottom);

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [scrollKey]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};
