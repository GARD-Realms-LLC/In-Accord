import { redirect } from "next/navigation";

import { currentProfile } from "@/lib/current-profile";
import {
  resolveChannelRouteContextForProfile,
  resolveServerRouteContext,
} from "@/lib/route-slug-resolver";
import { buildChannelPath, buildServerPath } from "@/lib/route-slugs";

type RootSlugPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const RootSlugPage = async ({ params, searchParams }: RootSlugPageProps) => {
  const { slug } = await params;
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const serverContext = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam: slug,
  });

  if (serverContext) {
    return redirect(
      buildServerPath({
        id: serverContext.id,
        name: serverContext.name,
      })
    );
  }

  const channelContext = await resolveChannelRouteContextForProfile({
    profileId: profile.id,
    channelParam: slug,
  });

  if (!channelContext) {
    return redirect("/");
  }

  void searchParams;
  return redirect(
    buildChannelPath({
      server: {
        id: channelContext.serverId,
        name: channelContext.serverName,
      },
      channel: {
        id: channelContext.channelId,
        name: channelContext.channelName,
      },
    })
  );
};

export default RootSlugPage;
