"use client";

import { X } from "lucide-react";
import Image from "next/image";

import { UploadDropzone } from "@/lib/uploadthing";

import "@uploadthing/react/styles.css";

interface FileUploadProps {
  onChange: (url?: string) => void;
  value: string;
  endpoint: "serverImage" | "messageFile" | "emojiImage";
  multiple?: boolean;
  onUploadComplete?: (urls: string[]) => void;
  onUploadError?: (message: string) => void;
}

const resolveUploadedUrl = (
  uploaded:
    | {
        url?: string;
        ufsUrl?: string;
        fileUrl?: string;
        appUrl?: string;
        serverData?: {
          url?: string;
          appUrl?: string;
        } | null;
      }
    | undefined
) =>
  uploaded?.url ||
  uploaded?.ufsUrl ||
  uploaded?.fileUrl ||
  uploaded?.appUrl ||
  uploaded?.serverData?.url ||
  uploaded?.serverData?.appUrl ||
  "";

export const FileUpload = ({ onChange, value, endpoint, multiple = false, onUploadComplete, onUploadError }: FileUploadProps) => {
  const fileType = value.split(".")[0];

  if (!multiple && value && fileType !== "pdf") {
    return (
      <div className="relative h-20 w-20">
        <Image fill src={value} alt="Upload" className="rounded-full" unoptimized />
        <button
          onClick={() => onChange("")}
          className="bg-rose-500 text-white p-1 rounded-full 
          absolute top-0 right-0 shadow-sm"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <UploadDropzone
      endpoint={endpoint}
      onClientUploadComplete={(res) => {
        const uploadedUrls =
          res
            ?.map((item) =>
              resolveUploadedUrl(
                item as
                  | {
                      url?: string;
                      ufsUrl?: string;
                      fileUrl?: string;
                      appUrl?: string;
                      serverData?: {
                        url?: string;
                        appUrl?: string;
                      } | null;
                    }
                  | undefined
              )
            )
            .filter((url) => url.length > 0) ?? [];

        if (onUploadComplete) {
          onUploadComplete(uploadedUrls);
        }

        onChange(uploadedUrls[0] ?? "");
      }}
      onUploadError={(error: Error) => {
        const message = String(error?.message ?? "Upload failed.").trim() || "Upload failed.";
        if (onUploadError) {
          onUploadError(message);
        }
        console.log(error);
      }}
    />
  );
};
