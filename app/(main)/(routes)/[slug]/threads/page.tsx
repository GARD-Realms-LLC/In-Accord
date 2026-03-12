import { redirect } from "next/navigation";

import { currentProfile } from "@/lib/current-profile";
import { resolveChannelRouteContextForProfile } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";

type RootSlugThreadsPageProps = {
  params: Promise<{ slug: string }>;
};

const RootSlugThreadsPage = async ({ params }: RootSlugThreadsPageProps) => {
  const { slug } = await params;
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const channelContext = await resolveChannelRouteContextForProfile({
    profileId: profile.id,
    channelParam: slug,
  });

  if (!channelContext) {
    return redirect("/");
  }

  return redirect(
    `${buildChannelPath({
      server: {
        id: channelContext.serverId,
        name: channelContext.serverName,
      },
      channel: {
        id: channelContext.channelId,
        name: channelContext.channelName,
      },
    })}/threads`
  );
};

export default RootSlugThreadsPage;
