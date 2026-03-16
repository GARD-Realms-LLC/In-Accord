"use client";

import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, ImagePlus, Mic, RadioTower } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveBannerUrl } from "@/lib/asset-url";

type EventChannelKind = "STAGE" | "VOICE" | "TEXT";
type ServerChannelItem = {
  id: string;
  name: string;
  type: "TEXT" | "AUDIO" | "VIDEO";
};
type EventFrequency = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";

const CHANNEL_KIND_OPTIONS: Array<{
  value: EventChannelKind;
  label: string;
  subtitle: string;
  icon: typeof RadioTower;
}> = [
  {
    value: "STAGE",
    label: "Stage Channel",
    subtitle: "Best for moderated events and presentations.",
    icon: RadioTower,
  },
  {
    value: "VOICE",
    label: "Voice Channel",
    subtitle: "Live voice hangouts and open discussions.",
    icon: Mic,
  },
  {
    value: "TEXT",
    label: "Text Channel",
    subtitle: "Chat-based events and async participation.",
    icon: Hash,
  },
];

const getDefaultStartsAt = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 15);
  now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const getDefaultStartDate = () => getDefaultStartsAt().slice(0, 10);
const getDefaultStartTime = () => getDefaultStartsAt().slice(11, 16);

export const CreateEventModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [channelKind, setChannelKind] = useState<EventChannelKind | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [serverChannels, setServerChannels] = useState<ServerChannelItem[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [startTime, setStartTime] = useState(getDefaultStartTime());
  const [frequency, setFrequency] = useState<EventFrequency>("ONCE");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [creatorImageUrl, setCreatorImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "createEvent";

  const resolvedServerId = useMemo(() => {
    const modalServerId = String(data.server?.id ?? "").trim();
    return modalServerId;
  }, [data.server?.id]);

  const serverName = useMemo(() => String(data.server?.name ?? "").trim(), [data.server?.name]);

  const selectedChannelName = useMemo(() => {
    const selected = serverChannels.find((item) => item.id === selectedChannelId);
    return selected?.name ?? "Unknown channel";
  }, [selectedChannelId, serverChannels]);
  const resolvedBannerUrl = useMemo(() => resolveBannerUrl(bannerUrl), [bannerUrl]);

  const formattedStart = useMemo(() => {
    if (!startDate || !startTime) {
      return "Start date/time not set";
    }

    const dt = new Date(`${startDate}T${startTime}`);
    if (Number.isNaN(dt.getTime())) {
      return "Invalid date/time";
    }

    return dt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [startDate, startTime]);

  const filteredChannels = useMemo(() => {
    if (!channelKind) {
      return [] as ServerChannelItem[];
    }

    const targetType =
      channelKind === "TEXT" ? "TEXT" : channelKind === "VOICE" ? "AUDIO" : "VIDEO";

    return serverChannels.filter((item) => item.type === targetType);
  }, [channelKind, serverChannels]);

  useEffect(() => {
    if (!isModalOpen || !resolvedServerId) {
      return;
    }

    let cancelled = false;

    const loadChannels = async () => {
      try {
        setChannelsLoading(true);
        const response = await axios.get<{ channels?: ServerChannelItem[] }>("/api/channels", {
          params: { serverId: resolvedServerId },
        });

        if (cancelled) {
          return;
        }

        const channels = Array.isArray(response.data.channels) ? response.data.channels : [];
        setServerChannels(channels);
      } catch {
        if (!cancelled) {
          setServerChannels([]);
        }
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
        }
      }
    };

    void loadChannels();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, resolvedServerId]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    let cancelled = false;

    const loadCreator = async () => {
      try {
        const response = await axios.get<{ name?: string; imageUrl?: string }>("/api/profile/me");
        if (cancelled) {
          return;
        }

        setCreatorName(String(response.data.name ?? "").trim());
        setCreatorImageUrl(String(response.data.imageUrl ?? "").trim());
      } catch {
        if (!cancelled) {
          setCreatorName("");
          setCreatorImageUrl("");
        }
      }
    };

    void loadCreator();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const resetState = () => {
    setStep(1);
    setChannelKind(null);
    setSelectedChannelId("");
    setServerChannels([]);
    setChannelsLoading(false);
    setTitle("");
    setStartDate(getDefaultStartDate());
    setStartTime(getDefaultStartTime());
    setFrequency("ONCE");
    setDescription("");
    setBannerUrl("");
    setIsUploadingBanner(false);
    setCreatorName("");
    setCreatorImageUrl("");
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const onPickBanner = () => {
    if (isSubmitting || isUploadingBanner) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingBanner(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setBannerUrl(String(upload.data.url ?? "").trim());
    } catch (uploadError) {
      if (axios.isAxiosError(uploadError)) {
        const message =
          (uploadError.response?.data as { error?: string } | undefined)?.error ||
          uploadError.message ||
          "Failed to upload banner image.";
        setError(message);
      } else {
        setError("Failed to upload banner image.");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onCreate = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError("Event title is required.");
      return;
    }

    if (!resolvedServerId) {
      setError("Unable to determine server context. Please open Create Event from the server menu.");
      return;
    }

    if (!channelKind) {
      setError("Select where your event will happen.");
      return;
    }

    if (!startDate) {
      setError("Event start date is required.");
      return;
    }

    if (!startTime) {
      setError("Event start time is required.");
      return;
    }

    const startsAtDate = new Date(`${startDate}T${startTime}`);
    if (Number.isNaN(startsAtDate.getTime())) {
      setError("Event start date/time is invalid.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const startsAtIso = startsAtDate.toISOString();

      await axios.post(`/api/servers/${encodeURIComponent(resolvedServerId)}/scheduled-events`, {
        title: normalizedTitle,
        description: description.trim() || null,
        startsAt: startsAtIso,
        frequency,
        channelKind,
        channelId: selectedChannelId || null,
        bannerUrl: bannerUrl || null,
      });

      window.dispatchEvent(new CustomEvent("inaccord:event-created", { detail: { serverId: resolvedServerId } }));
      router.refresh();
      handleClose();
    } catch (createError) {
      if (axios.isAxiosError(createError)) {
        const message =
          (typeof createError.response?.data === "string" ? createError.response.data : "") ||
          (createError.response?.data as { error?: string } | undefined)?.error ||
          createError.message ||
          "Failed to create event.";
        setError(message);
      } else {
        setError("Failed to create event.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isModalOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="gap-0 overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader className="space-y-2 border-b border-black/20 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-[20px] font-semibold leading-tight text-white">Create Event</DialogTitle>
          <DialogDescription className="text-sm text-[#6b7280] dark:text-[#b5bac1]">
            {serverName ? `in ${serverName}` : "in this server"}
          </DialogDescription>
          <p className="pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">Step {step} of 3</p>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-5 pt-4">
          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-100">Where is your event?</p>
              <div className="space-y-2">
                {CHANNEL_KIND_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = channelKind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setChannelKind(option.value);
                        setSelectedChannelId("");
                        setError(null);
                      }}
                      className={`w-full rounded-md border px-3 py-3 text-left transition ${
                        active
                          ? "border-[#5865f2] bg-[#5865f2]/15"
                          : "border-zinc-700 bg-[#1e1f22] hover:border-zinc-500"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/25 text-zinc-100">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-100">{option.label}</span>
                          <span className="block text-xs text-zinc-400">{option.subtitle}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {channelKind ? (
                <div className="pt-1">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">
                    Select {channelKind === "STAGE" ? "stage" : channelKind === "VOICE" ? "voice" : "text"} channel
                  </p>
                  <Select
                    value={selectedChannelId || undefined}
                    onValueChange={(value) => {
                      setSelectedChannelId(value);
                      setError(null);
                      setStep(2);
                    }}
                    disabled={channelsLoading || filteredChannels.length === 0}
                  >
                    <SelectTrigger className="h-10 border border-zinc-700 bg-[#1e1f22] text-zinc-100 focus:ring-1 focus:ring-[#5865f2]">
                      <SelectValue
                        placeholder={
                          channelsLoading
                            ? "Loading channels..."
                            : filteredChannels.length === 0
                              ? "No channels of this type"
                              : "Choose a channel"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Event topic</p>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Town Hall"
                  className="h-10 border border-zinc-700 bg-[#1e1f22] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-[#5865f2] focus-visible:ring-offset-0"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Start date</p>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    disabled={isSubmitting}
                    className="h-10 border border-zinc-700 bg-[#1e1f22] text-zinc-100 focus-visible:ring-1 focus-visible:ring-[#5865f2] focus-visible:ring-offset-0"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Start time</p>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    disabled={isSubmitting}
                    className="h-10 border border-zinc-700 bg-[#1e1f22] text-zinc-100 focus-visible:ring-1 focus-visible:ring-[#5865f2] focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Frequency</p>
                <Select
                  value={frequency}
                  onValueChange={(value) => setFrequency(value as EventFrequency)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-10 border border-zinc-700 bg-[#1e1f22] text-zinc-100 focus:ring-1 focus:ring-[#5865f2]">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONCE">Once</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Description</p>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Optional details"
                  rows={4}
                  className="w-full resize-none rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none ring-offset-0 focus-visible:ring-1 focus-visible:ring-[#5865f2]"
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300">Banner image</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[#4e5058] text-white hover:bg-[#5d6069]"
                    onClick={onPickBanner}
                    disabled={isSubmitting || isUploadingBanner}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {isUploadingBanner ? "Uploading..." : bannerUrl ? "Change banner" : "Select banner image"}
                  </Button>
                  {bannerUrl ? <span className="truncate text-xs text-zinc-300">Image selected</span> : null}
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void onBannerChange(event.target.files?.[0])}
                />
                {resolvedBannerUrl ? (
                  <img
                    src={resolvedBannerUrl}
                    alt="Event banner preview"
                    className="mt-3 h-24 w-full rounded-md border border-zinc-700 object-cover"
                  />
                ) : null}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="overflow-hidden rounded-md border border-zinc-700 bg-[#1e1f22] text-sm">
                {resolvedBannerUrl ? (
                  <img src={resolvedBannerUrl} alt="Event banner preview" className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-28 w-full bg-gradient-to-r from-[#5865f2]/40 via-[#3b82f6]/30 to-[#1f2937]" />
                )}

                <div className="space-y-3 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Date & time</p>
                      <p className="truncate text-sm text-zinc-200">{formattedStart}</p>
                    </div>

                    {creatorImageUrl ? (
                      <img
                        src={creatorImageUrl}
                        alt={creatorName ? `${creatorName} avatar` : "Creator avatar"}
                        className="h-10 w-10 shrink-0 rounded-full border border-zinc-600 object-cover"
                      />
                    ) : (
                      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-700 text-sm font-semibold text-zinc-100">
                        {creatorName.trim().charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Title</p>
                    <p className="text-zinc-100">{title.trim() || "(missing)"}</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Description</p>
                    <p className="whitespace-pre-wrap text-zinc-200">{description.trim() || "(none)"}</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Channel</p>
                    <p className="text-zinc-200">{selectedChannelName}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </div>

        <DialogFooter className="flex-row items-center gap-2 border-t border-black/20 bg-[#2b2d31] px-6 py-4">
          {step === 1 ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-300 hover:bg-white/10 hover:text-white"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                className="bg-[#5865f2] hover:bg-[#4752c4]"
                onClick={() => {
                  if (!channelKind) {
                    setError("Select where your event will happen.");
                    return;
                  }

                  if (!selectedChannelId) {
                    setError("Select a channel from the dropdown to continue.");
                    return;
                  }

                  setError(null);
                  setStep(2);
                }}
                disabled={isSubmitting || isUploadingBanner}
              >
                Next
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex w-full items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-300 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                disabled={isSubmitting || isUploadingBanner}
              >
                Back
              </Button>

              <Button
                type="button"
                variant="primary"
                className="bg-[#5865f2] hover:bg-[#4752c4]"
                onClick={() => {
                  if (!title.trim()) {
                    setError("Event title is required.");
                    return;
                  }

                  if (!startDate) {
                    setError("Event start date is required.");
                    return;
                  }

                  if (!startTime) {
                    setError("Event start time is required.");
                    return;
                  }

                  setError(null);
                  setStep(3);
                }}
                disabled={isSubmitting || isUploadingBanner}
              >
                Next
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex w-full items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-300 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                disabled={isSubmitting || isUploadingBanner}
              >
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-zinc-300 hover:bg-white/10 hover:text-white"
                  onClick={handleClose}
                  disabled={isSubmitting || isUploadingBanner}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="bg-[#5865f2] hover:bg-[#4752c4]"
                  onClick={() => void onCreate()}
                  disabled={isSubmitting || isUploadingBanner}
                >
                  {isSubmitting ? "Creating..." : "Create Event"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
