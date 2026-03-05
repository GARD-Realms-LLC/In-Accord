"use client";

import { X } from "lucide-react";
import Image from "next/image";

import { UploadDropzone } from "@/lib/uploadthing";

import "@uploadthing/react/styles.css";

interface FileUploadProps {
  onChange: (url?: string) => void;
  value: string;
  endpoint: "serverImage" | "messageFile";
}

type UploadthingFile = {
  url?: string;
  ufsUrl?: string;
  fileUrl?: string;
  appUrl?: string;
  serverData?: {
    url?: string;
    appUrl?: string;
  };
};

export const FileUpload = ({ onChange, value, endpoint }: FileUploadProps) => {
  const fileType = value.split(".")[0];

  if (value && fileType !== "pdf") {
    return (
      <div className="relative h-20 w-20">
        <Image fill src={value} alt="Upload" className="rounded-full" />
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
      onClientUploadComplete={(res: UploadthingFile[] | undefined) => {
        const uploaded = res?.[0];
        onChange(
          uploaded?.url ||
            uploaded?.ufsUrl ||
            uploaded?.fileUrl ||
            uploaded?.appUrl ||
            uploaded?.serverData?.url ||
            uploaded?.serverData?.appUrl ||
            ""
        );
      }}
      onUploadError={(error: Error) => console.log(error)}
    />
  );
};
