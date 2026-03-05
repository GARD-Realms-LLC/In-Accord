import { type Channel, ChannelType, type Server } from "@/lib/db/types";
import { create } from "zustand";

export type ModalType =
  | "createServer"
  | "settings"
  | "inAccordAdmin"
  | "invite"
  | "editServer"
  | "members"
  | "createChannel"
  | "editChannel"
  | "deleteChannel"
  | "leaveServer"
  | "deleteServer"
  | "deleteMessage"
  | "messageFile";

interface ModalData {
  server?: Server;
  channel?: Channel;
  channelType?: ChannelType;
  profileId?: string | null;
  profileRealName?: string | null;
  profileName?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
  apiUrl?: string;
  query?: Record<string, any>;
}

interface ModalStore {
  type: ModalType | null;
  data: ModalData;
  isOpen: boolean;
  onOpen: (type: ModalType, data?: ModalData) => void;
  onClose: () => void;
}

export const useModal = create<ModalStore>((set) => ({
  type: null,
  data: {},
  isOpen: false,
  onOpen: (type: ModalType, data = {}) => set({ type, isOpen: true, data }),
  onClose: () => set({ type: null, isOpen: false }),
}));
