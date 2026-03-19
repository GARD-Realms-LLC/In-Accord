import "./globals.css";
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";

import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ModalProvider } from "@/components/providers/modal-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { ContextMenuProvider } from "@/components/providers/context-menu-provider";
import { ToasterProvider } from "@/components/providers/toaster-provider";
import { AdvancedPreferencesProvider } from "@/components/providers/advanced-preferences-provider";
import { StreamerModePreferencesProvider } from "@/components/providers/streamer-mode-preferences-provider";
import { GameOverlayPreferencesProvider } from "@/components/providers/game-overlay-preferences-provider";
import { ActivityPrivacyPreferencesProvider } from "@/components/providers/activity-privacy-preferences-provider";
import { CurrentGameSyncProvider } from "@/components/providers/current-game-sync-provider";
import { BuildStalenessProvider } from "@/components/providers/build-staleness-provider";
import {
  INACCORD_BUILD_NUMBER,
  INACCORD_INTERNAL_VERSION,
  INACCORD_VERSION_LABEL,
} from "@/lib/build-version";

const font = Open_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "In-Accord",
  description: "In-Accord — Social Your Way!",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(font.className)} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={[
            "light",
            "dark",
            "dark-blue",
            "dark-teal",
            "light-blue",
            "light-red",
            "dark-red",
            "light-gray",
            "dark-gray",
            "custom-theme",
          ]}
          storageKey="in-accord-theme"
        >
          <SocketProvider>
            <AdvancedPreferencesProvider />
            <StreamerModePreferencesProvider />
            <ActivityPrivacyPreferencesProvider />
            <GameOverlayPreferencesProvider />
            <CurrentGameSyncProvider />
            <BuildStalenessProvider
              currentVersion={INACCORD_INTERNAL_VERSION}
              currentDisplayVersion={INACCORD_VERSION_LABEL}
              currentBuildNumber={INACCORD_BUILD_NUMBER}
            />
            <ContextMenuProvider />
            <ModalProvider />
            <ToasterProvider />
            {children}
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
