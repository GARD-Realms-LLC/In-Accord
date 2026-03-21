"use client";

import * as React from "react";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class" | string;
  defaultTheme?: string;
  enableSystem?: boolean;
  themes?: string[];
  storageKey?: string;
};

type ThemeContextValue = {
  theme: string;
  setTheme: (theme: string) => void;
  themes: string[];
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  themes: [],
});

const LIGHT_COLOR_SCHEME_THEMES = new Set(["light", "light-blue", "light-red", "light-gray"]);
const DARK_COLOR_SCHEME_THEMES = new Set([
  "dark",
  "dark-blue",
  "dark-teal",
  "dark-red",
  "dark-gray",
  "custom-theme",
]);

const resolveStoredTheme = ({
  defaultTheme,
  enableSystem,
  storageKey,
}: {
  defaultTheme: string;
  enableSystem: boolean;
  storageKey: string;
}) => {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  try {
    const stored = String(window.localStorage.getItem(storageKey) ?? "").trim();
    if (stored) {
      if (stored === "system" && enableSystem) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return stored;
    }
  } catch {}

  if (defaultTheme === "system" && enableSystem) {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "dark";
    }
  }

  return defaultTheme;
};

const resolveColorScheme = (theme: string) => {
  if (LIGHT_COLOR_SCHEME_THEMES.has(theme)) {
    return "light";
  }

  if (DARK_COLOR_SCHEME_THEMES.has(theme)) {
    return "dark";
  }

  return null;
};

const applyThemeToDocument = ({
  attribute,
  theme,
  themes,
}: {
  attribute: string;
  theme: string;
  themes: string[];
}) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  if (attribute === "class") {
    if (themes.length > 0) {
      root.classList.remove(...themes);
    }
    if (theme) {
      root.classList.add(theme);
    }
  } else if (attribute) {
    root.setAttribute(attribute, theme);
  }

  const colorScheme = resolveColorScheme(theme);
  if (colorScheme) {
    root.style.colorScheme = colorScheme;
  } else {
    root.style.removeProperty("color-scheme");
  }
};

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "dark",
  enableSystem = false,
  themes = ["light", "dark"],
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState(defaultTheme);

  React.useEffect(() => {
    const nextTheme = resolveStoredTheme({
      defaultTheme,
      enableSystem,
      storageKey,
    });

    setThemeState(nextTheme);
    applyThemeToDocument({
      attribute,
      theme: nextTheme,
      themes,
    });
  }, [attribute, defaultTheme, enableSystem, storageKey, themes]);

  const setTheme = React.useCallback(
    (nextTheme: string) => {
      const normalizedTheme = String(nextTheme ?? "").trim() || defaultTheme;
      const resolvedTheme =
        normalizedTheme === "system" && enableSystem
          ? resolveStoredTheme({
              defaultTheme: "system",
              enableSystem,
              storageKey,
            })
          : normalizedTheme;

      setThemeState(resolvedTheme);

      try {
        window.localStorage.setItem(storageKey, normalizedTheme);
      } catch {}

      applyThemeToDocument({
        attribute,
        theme: resolvedTheme,
        themes,
      });
    },
    [attribute, defaultTheme, enableSystem, storageKey, themes]
  );

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      themes,
    }),
    [theme, setTheme, themes]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);
