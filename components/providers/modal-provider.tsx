"use client";

import { useEffect, useState } from "react";

import { CreateServerModal } from "@/components/modals/create-server-modal";
import { InviteModal } from "@/components/modals/invite-modal";
import { EditServerModal } from "@/components/modals/edit-server-modal";
import { MembersModal } from "@/components/modals/members-modal";
import { CreateChannelModal } from "@/components/modals/create-channel-modal";
import { CreateFormModal } from "@/components/modals/create-form-modal";
import { LeaveServerModal } from "@/components/modals/leave-server-modal";
import { DeleteServerModal } from "@/components/modals/delete-server-modal";
import { DeleteChannelModal } from "@/components/modals/delete-channel-modal";
import { EditChannelModal } from "@/components/modals/edit-channel-modal";
import { SettingsModal } from "@/components/modals/settings-modal";
import { InAccordAdminModal } from "@/components/modals/in-accord-admin-modal";
import { JoinServerModal } from "@/components/modals/join-server-modal";
import { CreateChannelGroupModal } from "@/components/modals/create-channel-group-modal";
import { EditChannelGroupModal } from "@/components/modals/edit-channel-group-modal";
import { MessageFileModal } from "@/components/modals/message-file-modal";
import { DeleteMessageModal } from "@/components/modals/delete-message-modal";
import { BulkDeleteMessagesModal } from "@/components/modals/bulk-delete-messages-modal";
import { CreateEventModal } from "@/components/modals/create-event-modal";
import { ServerEventsModal } from "@/components/modals/server-events-modal";
import { AergerGuideModal } from "@/components/modals/aerger-guide-modal";
import { BoostersModal } from "@/components/modals/boosters-modal";
import { ServerStageModal } from "@/components/modals/server-stage-modal";
import { ServerRulesModal } from "@/components/modals/server-rules-modal";

export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <CreateServerModal />
      <JoinServerModal />
      <InviteModal />
      <EditServerModal />
      <MembersModal />
      <CreateChannelModal />
      <CreateEventModal />
      <ServerEventsModal />
      <AergerGuideModal />
      <BoostersModal />
      <ServerStageModal />
      <ServerRulesModal />
      <CreateFormModal />
      <CreateChannelGroupModal />
      <EditChannelGroupModal />
      <LeaveServerModal />
      <DeleteServerModal />
      <DeleteChannelModal />
      <DeleteMessageModal />
      <BulkDeleteMessagesModal />
      <EditChannelModal />
      <MessageFileModal />
      <SettingsModal />
      <InAccordAdminModal />
    </>
  );
};
