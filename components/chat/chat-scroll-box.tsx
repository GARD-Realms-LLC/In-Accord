"use client";

import { useEffect, useRef } from "react";

type ChatScrollBoxProps = {
  className?: string;
  scrollKey?: string | number;
  stickToBottomOffset?: number;
  forceStickToBottom?: boolean;
  children: React.ReactNode;
};

export const ChatScrollBox = ({
  className,
  scrollKey,
  stickToBottomOffset = 120,
  forceStickToBottom = false,
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
      if (forceStickToBottom) {
        scrollToBottom();
        return;
      }

      shouldStickToBottomRef.current = isNearBottom(container, stickToBottomOffset);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [forceStickToBottom, stickToBottomOffset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (!forceStickToBottom && !shouldStickToBottomRef.current) {
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
  }, [forceStickToBottom, scrollKey]);

  useEffect(() => {
    if (!forceStickToBottom) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    let raf = 0;
    const scheduleScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(scrollToBottom);
    };

    scrollToBottom();

    const mutationObserver = new MutationObserver(scheduleScroll);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const resizeObserver = new ResizeObserver(scheduleScroll);
    resizeObserver.observe(container);

    const onWindowResize = () => {
      scheduleScroll();
    };

    const onCapturedLoad = () => {
      scheduleScroll();
    };

    window.addEventListener("resize", onWindowResize);
    container.addEventListener("load", onCapturedLoad, true);

    const interval = window.setInterval(scrollToBottom, 250);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      container.removeEventListener("load", onCapturedLoad, true);
      window.clearInterval(interval);
      window.cancelAnimationFrame(raf);
    };
  }, [forceStickToBottom]);

  const resolvedClassName = className
    ? `${className} chat-scroll-box-wrap min-w-0 max-w-full overflow-x-hidden`
    : "chat-scroll-box-wrap min-w-0 max-w-full overflow-x-hidden";

  return (
    <div ref={containerRef} className={resolvedClassName}>
      {children}
    </div>
  );
};
