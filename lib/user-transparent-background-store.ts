import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences";

type TransparentBackgroundSettings = {
  selectedBackground: string | null;
  uploadedBackgrounds: string[];
};


const normalizeUrlList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    unique.add(trimmed);
    if (unique.size >= 40) {
      break;
    }
  }

  return Array.from(unique);
};

const normalizeSelectedBackground = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeSettings = (value: unknown): TransparentBackgroundSettings => {
  if (!value || typeof value !== "object") {
    return {
      selectedBackground: null,
      uploadedBackgrounds: [],
    };
  }

  const source = value as {
    selectedBackground?: unknown;
    uploadedBackgrounds?: unknown;
  };

  return {
    selectedBackground: normalizeSelectedBackground(source.selectedBackground),
    uploadedBackgrounds: normalizeUrlList(source.uploadedBackgrounds),
  };
};

export async function getUserTransparentBackgroundSettings(
  userId: string
): Promise<TransparentBackgroundSettings> {
  const preferences = await getUserPreferences(userId);

  return normalizeSettings({
    selectedBackground: preferences.transparentBackground.selectedBackground,
    uploadedBackgrounds: preferences.transparentBackground.uploadedBackgrounds,
  });
}

export async function setUserTransparentBackgroundSettings(
  userId: string,
  settings: {
    selectedBackground?: string | null;
    uploadedBackgrounds?: string[];
  }
) {
  const normalized = normalizeSettings({
    selectedBackground: settings.selectedBackground,
    uploadedBackgrounds: settings.uploadedBackgrounds,
  });

  await updateUserPreferences(userId, {
    transparentBackgroundSelected: normalized.selectedBackground,
    transparentBackgroundUploads: normalized.uploadedBackgrounds,
  });

  return normalized;
}
