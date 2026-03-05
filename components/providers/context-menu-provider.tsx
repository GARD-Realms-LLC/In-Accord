"use client";

import { useEffect } from "react";

const ALLOW_CONTEXT_MENU_ATTR = "data-allow-native-context-menu";

export const ContextMenuProvider = () => {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(`[${ALLOW_CONTEXT_MENU_ATTR}]`)) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
    };
  }, []);

  return null;
};
