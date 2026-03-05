"use client";

import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModal } from "@/hooks/use-modal-store";
import { useEffect, useRef, useState } from "react";

const formSchema = z.object({
  name: z.string().min(1, { message: "Server name is required" }),
  imageUrl: z.string().min(1, { message: "Server image is required" }),
  bannerUrl: z.string().optional(),
  bannerFit: z.enum(["cover", "contain", "scale"]).optional(),
  bannerScale: z.number().min(1).max(2).optional(),
});

export const EditServerModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "editServer";
  const { server } = data;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      imageUrl: "",
      bannerUrl: "",
      bannerFit: "cover",
      bannerScale: 1,
    },
  });

  useEffect(() => {
    if (server) {
      form.setValue("name", server.name);
      form.setValue("imageUrl", server.imageUrl);
      form.setValue(
        "bannerUrl",
        (server as { bannerUrl?: string | null }).bannerUrl ?? ""
      );
      form.setValue(
        "bannerFit",
        ((server as { bannerFit?: "cover" | "contain" | "scale" | null }).bannerFit ?? "cover") as
          | "cover"
          | "contain"
          | "scale"
      );
      form.setValue(
        "bannerScale",
        (server as { bannerScale?: number | null }).bannerScale ?? 1
      );
    }
  }, [server, form]);

  const isLoading = form.formState.isSubmitting;
  const imageUrl = form.watch("imageUrl") || "";
  const bannerUrl = form.watch("bannerUrl") || "";
  const bannerFit = form.watch("bannerFit") || "cover";
  const bannerScale = form.watch("bannerScale") || 1;

  const onPickImage = () => {
    if (isUploadingImage || isLoading) {
      return;
    }

    fileInputRef.current?.click();
  };

  const onImageChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingImage(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("imageUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Image upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Image upload failed.");
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onPickBanner = () => {
    if (isUploadingBanner || isLoading) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("bannerUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Banner upload failed.");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);
      await axios.patch(`/api/servers/${server?.id}`, values);

      form.reset();
      router.refresh();
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;
        setSubmitError(message || "Failed to update server.");
      } else {
        setSubmitError("Failed to update server.");
      }
      console.log(error);
    }
  }

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setIsUploadingImage(false);
    setIsUploadingBanner(false);
    onClose();
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-[860px]">
        <DialogTitle className="sr-only">Server Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit server overview settings.
        </DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} suppressHydrationWarning>
            <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[240px_1fr]">
              <aside className="border-r border-black/20 bg-[#2B2D31] px-3 py-6">
                <p className="px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                  Server settings
                </p>

                <div className="space-y-1">
                  <button
                    type="button"
                    className="w-full rounded-md bg-[#404249] px-3 py-2 text-left text-sm font-semibold text-white"
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400"
                  >
                    Roles
                  </button>
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400"
                  >
                    Emoji
                  </button>
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400"
                  >
                    Moderation
                  </button>
                </div>
              </aside>

              <section className="flex h-full flex-col bg-[#313338]">
                <DialogHeader className="border-b border-black/20 px-8 pb-4 pt-6 text-left">
                  <DialogTitle className="text-xl font-semibold text-white">
                    Server Overview
                  </DialogTitle>
                  <DialogDescription className="pt-1 text-sm text-zinc-300">
                    Customize your server&apos;s appearance and identity.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-7 px-8 py-6">
                  <div className="grid gap-6 md:grid-cols-[120px_1fr] md:items-start">
                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={() => (
                        <FormItem>
                          <FormControl>
                            <div className="flex flex-col items-start gap-3">
                              {imageUrl ? (
                                <div className="group relative h-[96px] w-[96px]">
                                  <Image
                                    fill
                                    src={imageUrl}
                                    alt="Server icon"
                                    className="rounded-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={onPickImage}
                                    disabled={isUploadingImage || isLoading}
                                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                                    aria-label="Change server icon"
                                  >
                                    <Camera className="h-5 w-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => form.setValue("imageUrl", "", { shouldValidate: true, shouldDirty: true })}
                                    className="absolute right-0 top-0 rounded-full bg-rose-500 p-1 text-white shadow-sm"
                                    aria-label="Remove server icon"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPickImage}
                                  disabled={isUploadingImage || isLoading}
                                  className="group relative flex h-[96px] w-[96px] items-center justify-center rounded-full border-2 border-dashed border-zinc-500 bg-[#232428] transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Upload server icon"
                                >
                                  <Camera className="h-9 w-9 text-zinc-300" />
                                  <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm">
                                    <Plus className="h-4 w-4" />
                                  </span>
                                </button>
                              )}

                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => onImageChange(event.target.files?.[0])}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                        Server icon
                      </p>
                      <p className="text-sm text-zinc-300">
                        Upload a square image for best results.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isUploadingImage || isLoading}
                        onClick={onPickImage}
                        className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                      >
                        {isUploadingImage ? "Uploading..." : imageUrl ? "Change icon" : "Upload icon"}
                      </Button>
                    </div>
                  </div>

                  {submitError ? (
                    <p className="text-sm font-medium text-rose-400">Save error: {submitError}</p>
                  ) : null}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server name
                        </FormLabel>
                        <FormControl>
                          <Input
                            disabled={isLoading}
                            className="h-11 border border-zinc-700 bg-[#1E1F22] text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:ring-offset-0"
                            placeholder="Enter server name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bannerUrl"
                    render={() => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server banner
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-3">
                            <div className="relative h-24 w-full overflow-hidden rounded-md border border-zinc-700 bg-[#1E1F22]">
                              {bannerUrl ? (
                                <Image
                                  fill
                                  src={bannerUrl}
                                  alt="Server banner preview"
                                  className={bannerFit === "contain" ? "object-contain" : "object-cover"}
                                  style={
                                    bannerFit === "scale"
                                      ? { transform: `scale(${bannerScale})`, transformOrigin: "center" }
                                      : undefined
                                  }
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                                  No banner selected
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Fit mode
                                </p>
                                <select
                                  value={bannerFit}
                                  onChange={(event) =>
                                    form.setValue(
                                      "bannerFit",
                                      event.target.value as "cover" | "contain" | "scale",
                                      { shouldDirty: true }
                                    )
                                  }
                                  className="h-9 w-full rounded-md border border-zinc-700 bg-[#1E1F22] px-2 text-sm text-zinc-100"
                                  disabled={isLoading || isUploadingBanner}
                                >
                                  <option value="cover">Auto Fill</option>
                                  <option value="contain">Auto Fit</option>
                                  <option value="scale">Manual Scale</option>
                                </select>
                              </div>

                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Scale ({bannerScale.toFixed(2)}x)
                                </p>
                                <input
                                  type="range"
                                  min={1}
                                  max={2}
                                  step={0.05}
                                  value={bannerScale}
                                  onChange={(event) =>
                                    form.setValue("bannerScale", Number(event.target.value), {
                                      shouldDirty: true,
                                    })
                                  }
                                  className="w-full"
                                  disabled={bannerFit !== "scale" || isLoading || isUploadingBanner}
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isUploadingBanner || isLoading}
                                onClick={onPickBanner}
                                className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                              >
                                {isUploadingBanner ? "Uploading..." : bannerUrl ? "Change banner" : "Upload banner"}
                              </Button>

                              {bannerUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-zinc-300 hover:bg-white/10 hover:text-white"
                                  onClick={() => form.setValue("bannerUrl", "", { shouldDirty: true, shouldValidate: true })}
                                  disabled={isUploadingBanner || isLoading}
                                >
                                  Remove banner
                                </Button>
                              ) : null}
                            </div>

                            <input
                              ref={bannerInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => onBannerChange(event.target.files?.[0])}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-black/20 bg-[#2B2D31] px-8 py-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-white/10 hover:text-white"
                    onClick={handleClose}
                    disabled={isLoading || isUploadingImage || isUploadingBanner}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={isLoading || isUploadingImage || isUploadingBanner}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </section>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
