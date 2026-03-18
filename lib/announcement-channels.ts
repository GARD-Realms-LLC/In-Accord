import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let announcementChannelSchemaReady = false;

export const ensureAnnouncementChannelSchema = async () => {
  if (announcementChannelSchemaReady) {
    return;
  }

  await db.execute(sql`
    do $$
    begin
      if exists (
        select 1
        from pg_type t
        where t.typname = 'ChannelType'
      ) and not exists (
        select 1
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typname = 'ChannelType'
          and e.enumlabel = 'ANNOUNCEMENT'
      ) then
        alter type "ChannelType" add value 'ANNOUNCEMENT';
      end if;
    exception
      when duplicate_object then null;
    end
    $$;
  `);

  announcementChannelSchemaReady = true;
};
