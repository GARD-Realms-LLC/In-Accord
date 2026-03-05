"use client";

import { useRef, useState } from "react";
import axios from "axios";
import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";

interface UserIconUploaderProps {
  imageUrl?: string | null;
}

export const UserIconUploader = ({ imageUrl }: UserIconUploaderProps) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onPick = () => fileInputRef.current?.click();

  const onChange = async (file?: File) => {
    if (!file) return;

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/avatar", {
        imageUrl: upload.data.url,
      });

      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-y-2">
      <div className="relative">
        <UserAvatar src={imageUrl ?? undefined} className="h-[48px] w-[48px]" />
        <button
          type="button"
          onClick={onPick}
          disabled={isUploading}
          className="absolute -bottom-1 -right-1 rounded-full bg-indigo-600 p-1 text-white shadow"
          aria-label="Upload user icon"
        >
          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </button>
      </div>

      <Button type="button" size="sm" variant="ghost" disabled={isUploading} onClick={onPick}>
        {isUploading ? "Uploading..." : "Change Icon"}
      </Button>

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(e) => onChange(e.target.files?.[0])}
      />
    </div>
  );
};
