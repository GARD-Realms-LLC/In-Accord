import "./globals.css";
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";

import { cn } from "@/lib/utils";
import { INACCORD_BUILD_NUMBER, INACCORD_VERSION_LABEL, INACCORD_INTERNAL_VERSION } from "@/lib/build-version";
import { getStaleBuildBootstrapScript } from "@/lib/stale-build-reload";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { BuildStalenessProvider } from "@/components/providers/build-staleness-provider";
import { ModalProvider } from "@/components/providers/modal-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { ContextMenuProvider } from "@/components/providers/context-menu-provider";
import { ToasterProvider } from "@/components/providers/toaster-provider";
import { AdvancedPreferencesProvider } from "@/components/providers/advanced-preferences-provider";
import { StreamerModePreferencesProvider } from "@/components/providers/streamer-mode-preferences-provider";
import { GameOverlayPreferencesProvider } from "@/components/providers/game-overlay-preferences-provider";
import { ActivityPrivacyPreferencesProvider } from "@/components/providers/activity-privacy-preferences-provider";
import { CurrentGameSyncProvider } from "@/components/providers/current-game-sync-provider";

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
      <head>
        <script
          id="in-accord-stale-build-bootstrap"
          dangerouslySetInnerHTML={{ __html: getStaleBuildBootstrapScript() }}
        />
      </head>
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
            <ContextMenuProvider />
            <ModalProvider />
            <ToasterProvider />
            <BuildStalenessProvider
              currentVersion={INACCORD_INTERNAL_VERSION}
              currentDisplayVersion={INACCORD_VERSION_LABEL}
              currentBuildNumber={INACCORD_BUILD_NUMBER}
            />
            {children}
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
