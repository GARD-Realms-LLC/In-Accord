let announcementChannelSchemaReady = false;

export const ensureAnnouncementChannelSchema = async () => {
  if (announcementChannelSchemaReady) {
    return;
  }

  // D1 does not use PostgreSQL enum migrations.
  announcementChannelSchemaReady = true;
};