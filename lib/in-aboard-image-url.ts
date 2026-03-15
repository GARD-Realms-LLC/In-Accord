import { resolveAssetUrl } from "@/lib/asset-url";

export const toInAboardImageUrl = (value: unknown): string | null =>
  resolveAssetUrl(value, { width: 512, fit: "cover", quality: 85 });
