import "./globals.css";
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";

import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ModalProvider } from "@/components/providers/modal-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { ContextMenuProvider } from "@/components/providers/context-menu-provider";
import { ToasterProvider } from "@/components/providers/toaster-provider";

const font = Open_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "In-Accord",
  description: "In-Accord — Social Your Way!",
  icons: {
    icon: [
      { url: "/in-accord-steampunk-logo.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: [{ url: "/in-accord-steampunk-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(font.className)}>
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
            "transparent-theme",
          ]}
          storageKey="in-accord-theme"
        >
          <SocketProvider>
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
