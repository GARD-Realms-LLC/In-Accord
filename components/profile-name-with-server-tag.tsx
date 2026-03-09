"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { getProfileNameStyleClass, normalizeProfileNameStyleValue } from "@/lib/profile-name-styles";
import { cn } from "@/lib/utils";
import { NameplatePill } from "@/components/nameplate-pill";

type SelectedServerTag = {
  serverId: string;
  serverName: string;
  tagCode: string;
  iconKey: string;
  iconEmoji: string;
};

type ProfileCardPayload = {
  effectiveProfileName?: string | null;
  effectiveProfileNameStyle?: string | null;
  pronouns?: string | null;
  nameplateLabel?: string | null;
  nameplateColor?: string | null;
  nameplateImageUrl?: string | null;
  effectiveNameplateLabel?: string | null;
  effectiveNameplateColor?: string | null;
  effectiveNameplateImageUrl?: string | null;
  selectedServerTag?: SelectedServerTag | null;
  familyLifecycle?: {
    isFamilyLinked?: boolean;
    showFamilyIcon?: boolean;
    canConvertToNormal?: boolean;
    age?: number | null;
    state?: "managed-under-16" | "eligible-16-plus" | "normal";
  } | null;
};

type ProfileCardState = {
  effectiveProfileName: string | null;
  effectiveProfileNameStyle: string;
  pronouns: string | null;
  nameplateLabel: string | null;
  nameplateColor: string | null;
  nameplateImageUrl: string | null;
  effectiveNameplateLabel: string | null;
  effectiveNameplateColor: string | null;
  effectiveNameplateImageUrl: string | null;
  selectedServerTag: SelectedServerTag | null;
  showFamilyIcon: boolean;
};

type ProfileNameWithServerTagProps = {
  name: string;
  profileId?: string | null;
  memberId?: string | null;
  pronouns?: string | null;
  containerClassName?: string;
  nameClassName?: string;
  badgeClassName?: string;
  showNameplate?: boolean;
  nameplateClassName?: string;
  hideNameWhenNameplate?: boolean;
  plateMetaIcons?: ReactNode;
  stretchTagUnderPlate?: boolean;
};

const cardCache = new Map<string, ProfileCardState>();
const inflightRequests = new Map<string, Promise<ProfileCardState>>();

const getCacheKey = (profileId: string, memberId?: string | null) => `${profileId}::${memberId ?? ""}`;

const readCardState = async (profileId: string, memberId?: string | null) => {
  const cacheKey = getCacheKey(profileId, memberId);

  if (cardCache.has(cacheKey)) {
    return cardCache.get(cacheKey) ?? {
      effectiveProfileName: null,
      effectiveProfileNameStyle: "standard",
      pronouns: null,
      nameplateLabel: null,
      nameplateColor: null,
      nameplateImageUrl: null,
      effectiveNameplateLabel: null,
      effectiveNameplateColor: null,
      effectiveNameplateImageUrl: null,
      selectedServerTag: null,
      showFamilyIcon: false,
    };
  }

  const existingRequest = inflightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = axios
    .get<ProfileCardPayload>(`/api/profile/${encodeURIComponent(profileId)}/card`, {
      params: memberId ? { memberId } : undefined,
    })
    .then((response) => {
      const effectiveProfileName =
        typeof response.data?.effectiveProfileName === "string" && response.data.effectiveProfileName.trim().length > 0
          ? response.data.effectiveProfileName.trim()
          : null;
      const effectiveProfileNameStyle = normalizeProfileNameStyleValue(response.data?.effectiveProfileNameStyle);
      const pronouns =
        typeof response.data?.pronouns === "string" && response.data.pronouns.trim().length > 0
          ? response.data.pronouns.trim()
          : null;
      const nameplateLabel =
        typeof response.data?.nameplateLabel === "string" && response.data.nameplateLabel.trim().length > 0
          ? response.data.nameplateLabel.trim()
          : null;
      const nameplateColor =
        typeof response.data?.nameplateColor === "string" && response.data.nameplateColor.trim().length > 0
          ? response.data.nameplateColor.trim()
          : null;
      const nameplateImageUrl =
        typeof response.data?.nameplateImageUrl === "string" && response.data.nameplateImageUrl.trim().length > 0
          ? response.data.nameplateImageUrl.trim()
          : null;
      const effectiveNameplateLabel =
        typeof response.data?.effectiveNameplateLabel === "string" && response.data.effectiveNameplateLabel.trim().length > 0
          ? response.data.effectiveNameplateLabel.trim()
          : null;
      const effectiveNameplateColor =
        typeof response.data?.effectiveNameplateColor === "string" && response.data.effectiveNameplateColor.trim().length > 0
          ? response.data.effectiveNameplateColor.trim()
          : null;
      const effectiveNameplateImageUrl =
        typeof response.data?.effectiveNameplateImageUrl === "string" && response.data.effectiveNameplateImageUrl.trim().length > 0
          ? response.data.effectiveNameplateImageUrl.trim()
          : null;
      const tag = response.data?.selectedServerTag;
      const normalized = tag && typeof tag.tagCode === "string" ? tag : null;
      const showFamilyIcon = Boolean(response.data?.familyLifecycle?.showFamilyIcon);
      const nextState: ProfileCardState = {
        effectiveProfileName,
        effectiveProfileNameStyle,
        pronouns,
        nameplateLabel,
        nameplateColor,
        nameplateImageUrl,
        effectiveNameplateLabel,
        effectiveNameplateColor,
        effectiveNameplateImageUrl,
        selectedServerTag: normalized,
        showFamilyIcon,
      };

      cardCache.set(cacheKey, nextState);
      return nextState;
    })
    .catch(() => {
      const fallbackState: ProfileCardState = {
        effectiveProfileName: null,
        effectiveProfileNameStyle: "standard",
        pronouns: null,
        nameplateLabel: null,
        nameplateColor: null,
        nameplateImageUrl: null,
        effectiveNameplateLabel: null,
        effectiveNameplateColor: null,
        effectiveNameplateImageUrl: null,
        selectedServerTag: null,
        showFamilyIcon: false,
      };
      cardCache.set(cacheKey, fallbackState);
      return fallbackState;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
};

export const ProfileNameWithServerTag = ({
  name,
  profileId,
  memberId,
  pronouns,
  containerClassName,
  nameClassName,
  badgeClassName,
  showNameplate = false,
  nameplateClassName,
  hideNameWhenNameplate = true,
  plateMetaIcons,
  stretchTagUnderPlate = false,
}: ProfileNameWithServerTagProps) => {
  const [effectiveProfileName, setEffectiveProfileName] = useState<string | null>(null);
  const [effectiveProfileNameStyle, setEffectiveProfileNameStyle] = useState<string>("standard");
  const [resolvedCardPronouns, setResolvedCardPronouns] = useState<string | null>(null);
  const [nameplateLabel, setNameplateLabel] = useState<string | null>(null);
  const [nameplateColor, setNameplateColor] = useState<string | null>(null);
  const [nameplateImageUrl, setNameplateImageUrl] = useState<string | null>(null);
  const [effectiveNameplateLabel, setEffectiveNameplateLabel] = useState<string | null>(null);
  const [effectiveNameplateColor, setEffectiveNameplateColor] = useState<string | null>(null);
  const [effectiveNameplateImageUrl, setEffectiveNameplateImageUrl] = useState<string | null>(null);
  const [selectedServerTag, setSelectedServerTag] = useState<SelectedServerTag | null>(null);
  const [showFamilyIcon, setShowFamilyIcon] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const trimmedProfileId = useMemo(() => String(profileId ?? "").trim(), [profileId]);
  const trimmedMemberId = useMemo(() => String(memberId ?? "").trim(), [memberId]);

  useEffect(() => {
    if (!trimmedProfileId) {
      setEffectiveProfileName(null);
      setEffectiveProfileNameStyle("standard");
      setResolvedCardPronouns(null);
      setNameplateLabel(null);
      setNameplateColor(null);
      setNameplateImageUrl(null);
      setEffectiveNameplateLabel(null);
      setEffectiveNameplateColor(null);
      setEffectiveNameplateImageUrl(null);
      setSelectedServerTag(null);
      setShowFamilyIcon(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const state = await readCardState(trimmedProfileId, trimmedMemberId || null);
      if (!cancelled) {
        setEffectiveProfileName(state.effectiveProfileName);
        setEffectiveProfileNameStyle(state.effectiveProfileNameStyle);
        setResolvedCardPronouns(state.pronouns);
        setNameplateLabel(state.nameplateLabel);
        setNameplateColor(state.nameplateColor);
        setNameplateImageUrl(state.nameplateImageUrl);
        setEffectiveNameplateLabel(state.effectiveNameplateLabel);
        setEffectiveNameplateColor(state.effectiveNameplateColor);
        setEffectiveNameplateImageUrl(state.effectiveNameplateImageUrl);
        setSelectedServerTag(state.selectedServerTag);
        setShowFamilyIcon(state.showFamilyIcon);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken, trimmedMemberId, trimmedProfileId]);

  useEffect(() => {
    const onProfileRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ profileId?: string | null }>;
      const eventProfileId = String(customEvent.detail?.profileId ?? "").trim();

      if (!eventProfileId || eventProfileId === trimmedProfileId) {
        const cacheKey = getCacheKey(trimmedProfileId, trimmedMemberId || null);
        cardCache.delete(cacheKey);
        setRefreshToken((prev) => prev + 1);
      }
    };

    const onCardRefresh = () => {
      const cacheKey = getCacheKey(trimmedProfileId, trimmedMemberId || null);
      cardCache.delete(cacheKey);
      setRefreshToken((prev) => prev + 1);
    };

    window.addEventListener("inaccord:profile-updated", onProfileRefresh);
    window.addEventListener("inaccord:profile-card-refresh", onCardRefresh);

    return () => {
      window.removeEventListener("inaccord:profile-updated", onProfileRefresh);
      window.removeEventListener("inaccord:profile-card-refresh", onCardRefresh);
    };
  }, [trimmedMemberId, trimmedProfileId]);

  const resolvedName = effectiveProfileName ?? name;
  const resolvedNameplateLabel = effectiveNameplateLabel ?? nameplateLabel ?? null;
  const resolvedNameplateColor = effectiveNameplateColor ?? nameplateColor ?? null;
  const resolvedNameplateImageUrl = effectiveNameplateImageUrl ?? nameplateImageUrl ?? null;
  const resolvedPronouns = String(pronouns ?? resolvedCardPronouns ?? "").trim() || null;
  const hasAnyNameplateValue =
    Boolean(resolvedNameplateLabel) ||
    Boolean(resolvedNameplateColor) ||
    Boolean(resolvedNameplateImageUrl);
  const nameplateLabelForDisplay = resolvedNameplateLabel ?? resolvedName;
  const shouldHideName = showNameplate && hideNameWhenNameplate && hasAnyNameplateValue;
  const nameStyleClass = getProfileNameStyleClass(effectiveProfileNameStyle);
  const shouldRenderTagInsidePlate = showNameplate && hasAnyNameplateValue && Boolean(selectedServerTag);
  const serverTagInsidePlate = shouldRenderTagInsidePlate && selectedServerTag ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]",
        badgeClassName
      )}
      title={`Server tag from ${selectedServerTag.serverName}`}
    >
      <span>{selectedServerTag.iconEmoji}</span>
      <span>{selectedServerTag.tagCode}</span>
    </span>
  ) : null;
  const plateMetaContent = plateMetaIcons || serverTagInsidePlate ? (
    <span className="inline-flex items-center gap-1">
      {plateMetaIcons ? <span className="inline-flex items-center gap-1">{plateMetaIcons}</span> : null}
      {serverTagInsidePlate}
    </span>
  ) : null;
  const shouldRenderTagOutsidePlate = Boolean(selectedServerTag) && !shouldRenderTagInsidePlate;
  const renderMetaOutsidePlate = !(showNameplate && hasAnyNameplateValue);
  const familyBadge = showFamilyIcon ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fuchsia-100",
        badgeClassName
      )}
      title="Family managed account"
      aria-label="Family managed account"
    >
      <span>👨‍👩‍👧</span>
      <span>FAMILY</span>
    </span>
  ) : null;

  if (shouldHideName) {
    return (
      <span
        className={cn(
          stretchTagUnderPlate ? "flex w-full min-w-0 items-center gap-1.5" : "inline-flex min-w-0 items-center gap-1.5",
          containerClassName
        )}
      >
        <NameplatePill
          label={nameplateLabelForDisplay}
          subtitle={resolvedPronouns}
          color={resolvedNameplateColor}
          imageUrl={resolvedNameplateImageUrl}
          className={cn(stretchTagUnderPlate ? "min-w-0 flex-1 max-w-none" : "max-w-fit", nameplateClassName)}
          labelClassName={nameStyleClass}
          metaContent={plateMetaContent}
        />

        {shouldRenderTagOutsidePlate && selectedServerTag ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]",
              badgeClassName
            )}
            title={`Server tag from ${selectedServerTag.serverName}`}
          >
            <span>{selectedServerTag.iconEmoji}</span>
            <span>{selectedServerTag.tagCode}</span>
          </span>
        ) : null}
        {familyBadge}
      </span>
    );
  }

  return (
    <span
      className={cn(
        stretchTagUnderPlate ? "flex w-full min-w-0 flex-col" : "inline-flex min-w-0 flex-col",
        containerClassName
      )}
    >
      <span className={cn(stretchTagUnderPlate ? "flex w-full min-w-0 items-center gap-1.5" : "inline-flex min-w-0 items-center gap-1.5")}>
        <span className={cn("truncate", nameClassName, nameStyleClass)}>
          {resolvedName}
        </span>
        {renderMetaOutsidePlate && plateMetaContent ? (
          <span className="inline-flex items-center gap-1">{plateMetaIcons}</span>
        ) : null}
        {shouldRenderTagOutsidePlate && selectedServerTag ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]",
              badgeClassName
            )}
            title={`Server tag from ${selectedServerTag.serverName}`}
          >
            <span>{selectedServerTag.iconEmoji}</span>
            <span>{selectedServerTag.tagCode}</span>
          </span>
        ) : null}
        {familyBadge}
      </span>

      {showNameplate && hasAnyNameplateValue ? (
        <NameplatePill
          label={nameplateLabelForDisplay}
          subtitle={resolvedPronouns}
          color={resolvedNameplateColor}
          imageUrl={resolvedNameplateImageUrl}
          className={cn(stretchTagUnderPlate ? "mt-1 w-full max-w-full" : "mt-1 max-w-fit", nameplateClassName)}
          labelClassName={nameStyleClass}
          metaContent={plateMetaContent}
        />
      ) : null}
    </span>
  );
};
