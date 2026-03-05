import { eq } from "drizzle-orm";

import { db, server } from "@/lib/db";

interface ServerBackgroundRailProps {
  serverId: string;
  backgroundUrl?: string | null;
}

export const ServerBackgroundRail = async ({
  serverId,
  backgroundUrl,
}: ServerBackgroundRailProps) => {
  const currentServer = await db.query.server.findFirst({
    where: eq(server.id, serverId),
    columns: {
      imageUrl: true,
      name: true,
    },
  });

  const resolvedBackground =
    backgroundUrl?.trim() || currentServer?.imageUrl?.trim() || "";

  const backgroundImage = resolvedBackground
    ? `url("${resolvedBackground}")`
    : undefined;

  return (
    <aside
      className="h-full w-6 rounded-r-2xl border-r border-black/40 bg-[#181a1f] shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] overflow-hidden"
      aria-label="Server background rail"
      title={`${currentServer?.name ?? "Server"} background`}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#202227] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div
          className="h-20 w-full bg-cover bg-center bg-no-repeat"
          style={
            backgroundImage
              ? {
                  backgroundImage,
                }
              : {
                  backgroundImage:
                    "linear-gradient(180deg, rgba(45,212,191,0.45) 0%, rgba(37,99,235,0.35) 100%)",
                }
          }
        >
          <div className="h-full w-full bg-black/25" />
        </div>

        <div className="flex-1 bg-[#1b1d22]" />
      </div>
    </aside>
  );
};
