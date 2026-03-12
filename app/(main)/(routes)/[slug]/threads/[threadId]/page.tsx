import { redirect } from "next/navigation";

import { currentProfile } from "@/lib/current-profile";
import { resolveChannelRouteContextForProfile } from "@/lib/route-slug-resolver";
import { buildThreadPath } from "@/lib/route-slugs";

type RootSlugThreadPageProps = {
  params: Promise<{ slug: string; threadId: string }>;
};

const RootSlugThreadPage = async ({ params }: RootSlugThreadPageProps) => {
  const { slug, threadId } = await params;
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
    buildThreadPath({
      server: {
        id: channelContext.serverId,
        name: channelContext.serverName,
      },
      channel: {
        id: channelContext.channelId,
        name: channelContext.channelName,
      },
      threadId,
    })
  );
};

export default RootSlugThreadPage;
