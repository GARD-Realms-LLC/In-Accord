"use client"

import * as React from "react"
import { Circle, Monitor, Moon, Palette, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ThemeOption = {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
}

type TransparentBackgroundOption = {
  label: string
  value: string
}

type CustomThemeColors = {
  background: string
  card: string
  secondary: string
  accent: string
  primary: string
  foreground: string
  mutedForeground: string
  border: string
}

type TransparentBackgroundSettingsPayload = {
  selectedBackground: string | null
  uploadedBackgrounds: string[]
}

const TRANSPARENT_BG_ATTRIBUTE = "data-transparent-bg"
const UPLOADED_BG_PREFIX = "uploaded:"

const defaultCustomThemeColors: CustomThemeColors = {
  background: "#101419",
  card: "#172028",
  secondary: "#1f2b36",
  accent: "#274054",
  primary: "#22c6b9",
  foreground: "#f3fbff",
  mutedForeground: "#b4d2da",
  border: "#2d5a66",
}

const customThemeColorFields: Array<{ key: keyof CustomThemeColors; label: string }> = [
  { key: "background", label: "Main Background" },
  { key: "card", label: "Card Background" },
  { key: "secondary", label: "Secondary Surface" },
  { key: "accent", label: "Accent Surface" },
  { key: "primary", label: "Primary Accent" },
  { key: "foreground", label: "Primary Text" },
  { key: "mutedForeground", label: "Muted Text" },
  { key: "border", label: "Border" },
]

const hexToHslTokens = (hex: string) => {
  const normalized = hex.replace("#", "")

  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((chunk) => `${chunk}${chunk}`)
          .join("")
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) {
    return "0 0% 0%"
  }

  const r = Number.parseInt(safeHex.slice(0, 2), 16) / 255
  const g = Number.parseInt(safeHex.slice(2, 4), 16) / 255
  const b = Number.parseInt(safeHex.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  const l = (max + min) / 2
  const s =
    delta === 0
      ? 0
      : delta / (1 - Math.abs(2 * l - 1))

  if (delta !== 0) {
    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6)
        break
      case g:
        h = 60 * ((b - r) / delta + 2)
        break
      default:
        h = 60 * ((r - g) / delta + 4)
        break
    }
  }

  if (h < 0) {
    h += 360
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

const transparentBackgroundOptions: TransparentBackgroundOption[] = [
  { label: "Aurora Blue", value: "aurora-blue" },
  { label: "Sunset Red", value: "sunset-red" },
  { label: "Graphite", value: "graphite" },
  { label: "Forest", value: "forest" },
]

const themeOptions: ThemeOption[] = [
  { label: "Dark Mode", value: "dark", icon: Moon },
  { label: "Light Mode", value: "light", icon: Sun },
  {
    label: "Dark Blue",
    value: "dark-blue",
    icon: Circle,
    iconClassName: "fill-blue-700 text-blue-700",
  },
  {
    label: "Dark Teal",
    value: "dark-teal",
    icon: Circle,
    iconClassName: "fill-teal-700 text-teal-700",
  },
  {
    label: "Light Teal",
    value: "light-blue",
    icon: Circle,
    iconClassName: "fill-teal-400 text-teal-400",
  },
  {
    label: "Light Red",
    value: "light-red",
    icon: Circle,
    iconClassName: "fill-rose-400 text-rose-400",
  },
  {
    label: "Dark Red",
    value: "dark-red",
    icon: Circle,
    iconClassName: "fill-rose-700 text-rose-700",
  },
  {
    label: "Light Gray",
    value: "light-gray",
    icon: Circle,
    iconClassName: "fill-zinc-400 text-zinc-400",
  },
  {
    label: "Dark Gray",
    value: "dark-gray",
    icon: Circle,
    iconClassName: "fill-zinc-700 text-zinc-700",
  },
  { label: "Custom Colors", value: "custom-theme", icon: Palette },
  { label: "Transparent Theme", value: "transparent-theme", icon: Monitor },
]

export const ModeToggle = () => {
  const { setTheme, theme } = useTheme()
  const [isTransparentModalOpen, setIsTransparentModalOpen] = React.useState(false)
  const [isCustomThemeModalOpen, setIsCustomThemeModalOpen] = React.useState(false)
  const [transparentBackground, setTransparentBackground] = React.useState<string>(
    transparentBackgroundOptions[0].value
  )
  const [customThemeColors, setCustomThemeColors] = React.useState<CustomThemeColors>(defaultCustomThemeColors)
  const [uploadedBackgrounds, setUploadedBackgrounds] = React.useState<string[]>([])
  const [isUploadingBackground, setIsUploadingBackground] = React.useState(false)
  const backgroundInputRef = React.useRef<HTMLInputElement | null>(null)

  const persistTransparentBackgroundSettings = React.useCallback(
    async (settings: TransparentBackgroundSettingsPayload) => {
      try {
        await fetch("/api/profile/transparent-background", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        })
      } catch {
        // ignore network issues; current in-memory UI state remains active
      }
    },
    []
  )

  const applyCustomThemeColors = React.useCallback((colors: CustomThemeColors) => {
    document.documentElement.style.setProperty("--custom-background", hexToHslTokens(colors.background))
    document.documentElement.style.setProperty("--custom-card", hexToHslTokens(colors.card))
    document.documentElement.style.setProperty("--custom-secondary", hexToHslTokens(colors.secondary))
    document.documentElement.style.setProperty("--custom-accent", hexToHslTokens(colors.accent))
    document.documentElement.style.setProperty("--custom-primary", hexToHslTokens(colors.primary))
    document.documentElement.style.setProperty("--custom-foreground", hexToHslTokens(colors.foreground))
    document.documentElement.style.setProperty(
      "--custom-muted-foreground",
      hexToHslTokens(colors.mutedForeground)
    )
    document.documentElement.style.setProperty("--custom-border", hexToHslTokens(colors.border))
  }, [])

  const applyTransparentBackground = React.useCallback((value: string) => {
    if (value.startsWith(UPLOADED_BG_PREFIX)) {
      const backgroundUrl = value.slice(UPLOADED_BG_PREFIX.length)
      document.documentElement.setAttribute(TRANSPARENT_BG_ATTRIBUTE, "uploaded")
      document.documentElement.style.setProperty("--transparent-uploaded-bg", `url("${backgroundUrl}")`)
      return
    }

    document.documentElement.setAttribute(TRANSPARENT_BG_ATTRIBUTE, value)
    document.documentElement.style.removeProperty("--transparent-uploaded-bg")
  }, [])

  React.useEffect(() => {
    const fallbackValue = transparentBackgroundOptions[0].value
    applyTransparentBackground(fallbackValue)
    setTransparentBackground(fallbackValue)
    setUploadedBackgrounds([])

    let cancelled = false

    const hydrateFromServer = async () => {
      try {
        const response = await fetch("/api/profile/transparent-background", {
          method: "GET",
          cache: "no-store",
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          selectedBackground?: string | null
          uploadedBackgrounds?: unknown
        }

        if (cancelled) {
          return
        }

        const serverUploads = Array.isArray(payload.uploadedBackgrounds)
          ? payload.uploadedBackgrounds.filter((value): value is string => typeof value === "string")
          : []

        const serverValue = typeof payload.selectedBackground === "string" ? payload.selectedBackground : null

        const fallbackValue = transparentBackgroundOptions[0].value
        const mergedValue = serverValue && serverValue.trim().length > 0 ? serverValue : fallbackValue
        const isPreset = transparentBackgroundOptions.some((option) => option.value === mergedValue)
        const isUploaded = mergedValue.startsWith(UPLOADED_BG_PREFIX)
        const normalizedValue = isPreset || isUploaded ? mergedValue : fallbackValue

        setUploadedBackgrounds(serverUploads)
        setTransparentBackground(normalizedValue)
        applyTransparentBackground(normalizedValue)

      } catch {
        // keep default fallback
      }
    }

    hydrateFromServer()

    return () => {
      cancelled = true
    }
  }, [applyTransparentBackground])

  React.useEffect(() => {
    let cancelled = false

    const hydrateCustomTheme = async () => {
      let next = defaultCustomThemeColors

      try {
        const response = await fetch("/api/profile/preferences", {
          method: "GET",
          cache: "no-store",
        })

        if (response.ok) {
          const payload = (await response.json()) as {
            customThemeColors?: Partial<CustomThemeColors> | null
          }

          const parsed = payload.customThemeColors
          if (parsed && typeof parsed === "object") {
            next = {
              background:
                typeof parsed.background === "string" ? parsed.background : defaultCustomThemeColors.background,
              card: typeof parsed.card === "string" ? parsed.card : defaultCustomThemeColors.card,
              secondary:
                typeof parsed.secondary === "string" ? parsed.secondary : defaultCustomThemeColors.secondary,
              accent: typeof parsed.accent === "string" ? parsed.accent : defaultCustomThemeColors.accent,
              primary: typeof parsed.primary === "string" ? parsed.primary : defaultCustomThemeColors.primary,
              foreground:
                typeof parsed.foreground === "string" ? parsed.foreground : defaultCustomThemeColors.foreground,
              mutedForeground:
                typeof parsed.mutedForeground === "string"
                  ? parsed.mutedForeground
                  : defaultCustomThemeColors.mutedForeground,
              border: typeof parsed.border === "string" ? parsed.border : defaultCustomThemeColors.border,
            }
          }
        }
      } catch {
        // keep defaults
      }

      if (cancelled) {
        return
      }

      setCustomThemeColors(next)
      applyCustomThemeColors(next)
    }

    void hydrateCustomTheme()

    return () => {
      cancelled = true
    }
  }, [applyCustomThemeColors])

  const onChangeTransparentBackground = (value: string) => {
    applyTransparentBackground(value)
    setTransparentBackground(value)

    const uploadsSnapshot = uploadedBackgrounds
    void persistTransparentBackgroundSettings({
      selectedBackground: value,
      uploadedBackgrounds: uploadsSnapshot,
    })
  }

  const onPickBackground = () => {
    if (isUploadingBackground) {
      return
    }

    backgroundInputRef.current?.click()
  }

  const onUploadBackground = async (file?: File) => {
    if (!file) {
      return
    }

    try {
      setIsUploadingBackground(true)

      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/r2/upload?type=userBanner", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to upload background")
      }

      const payload = (await response.json()) as { url?: string }
      const uploadedUrl = payload.url

      if (!uploadedUrl) {
        throw new Error("Upload response missing URL")
      }

      let nextUploads: string[] = []

      setUploadedBackgrounds((previous) => {
        const next = [uploadedUrl, ...previous.filter((value) => value !== uploadedUrl)]
        nextUploads = next

        return next
      })

      const selectedToken = `${UPLOADED_BG_PREFIX}${uploadedUrl}`
      applyTransparentBackground(selectedToken)
      setTransparentBackground(selectedToken)

      void persistTransparentBackgroundSettings({
        selectedBackground: selectedToken,
        uploadedBackgrounds: nextUploads.length > 0 ? nextUploads : [uploadedUrl],
      })
    } catch (error) {
      window.alert("Background upload failed")
    } finally {
      setIsUploadingBackground(false)
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = ""
      }
    }
  }

  const saveCustomThemeColors = React.useCallback((next: CustomThemeColors) => {
    setCustomThemeColors(next)
    applyCustomThemeColors(next)

    void fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customThemeColors: next,
      }),
    })
  }, [applyCustomThemeColors])

  const onChangeCustomThemeColor = (key: keyof CustomThemeColors, value: string) => {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"
    const next = {
      ...customThemeColors,
      [key]: normalized,
    }

    saveCustomThemeColors(next)
  }

  const onResetCustomTheme = () => {
    saveCustomThemeColors(defaultCustomThemeColors)
  }

  return (
    <>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-[#b5bac1]">
          <Palette className="h-3.5 w-3.5" />
          Select a color mode
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {themeOptions.map((option) => {
            const Icon = option.icon
            const isActive = theme === option.value

            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTheme(option.value)

                  if (option.value === "transparent-theme") {
                    setIsTransparentModalOpen(true)
                  }

                  if (option.value === "custom-theme") {
                    setIsCustomThemeModalOpen(true)
                  }
                }}
                className={cn(
                  "justify-start gap-2 border-white/15 bg-[#1a1b1e] text-[#dbdee1] hover:bg-[#232428]",
                  isActive && "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                )}
                aria-pressed={isActive}
              >
                <Icon className={cn("h-4 w-4", option.iconClassName)} />
                <span className="truncate">{option.label}</span>
              </Button>
            )
          })}
        </div>

      </div>

      <Dialog open={isTransparentModalOpen} onOpenChange={setIsTransparentModalOpen}>
        <DialogContent className="border-white/10 bg-[#1e1f22] text-[#dbdee1]">
          <DialogHeader>
            <DialogTitle>Transparent Theme</DialogTitle>
            <DialogDescription className="text-[#949ba4]">
              Select Background to customize your transparent theme.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
              Select Background
            </label>

            <select
              value={transparentBackground.startsWith(UPLOADED_BG_PREFIX) ? transparentBackgroundOptions[0].value : transparentBackground}
              onChange={(event) => onChangeTransparentBackground(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#1a1b1e] px-3 py-2 text-sm text-[#dbdee1] outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
            >
              {transparentBackgroundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
                Uploaded Backgrounds
              </label>

              <Button
                type="button"
                size="sm"
                onClick={onPickBackground}
                disabled={isUploadingBackground}
                className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingBackground ? "Uploading..." : "Upload Background"}
              </Button>

              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => onUploadBackground(event.target.files?.[0])}
              />
            </div>

            {uploadedBackgrounds.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {uploadedBackgrounds.map((url) => {
                  const token = `${UPLOADED_BG_PREFIX}${url}`
                  const isActive = transparentBackground === token

                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => onChangeTransparentBackground(token)}
                      className={cn(
                        "overflow-hidden rounded-lg border border-white/15 bg-[#1a1b1e] text-left transition",
                        isActive ? "ring-2 ring-[#5865f2]" : "hover:border-white/30"
                      )}
                      title="Apply uploaded background"
                    >
                      <img src={url} alt="Uploaded background" className="h-20 w-full object-cover" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                No uploaded backgrounds yet.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setIsTransparentModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCustomThemeModalOpen} onOpenChange={setIsCustomThemeModalOpen}>
        <DialogContent className="border-white/10 bg-[#1e1f22] text-[#dbdee1]">
          <DialogHeader>
            <DialogTitle>Custome Colors</DialogTitle>
            <DialogDescription className="text-[#949ba4]">
              Pick your own colors for the Custom Theme.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            {customThemeColorFields.map((field) => (
              <label key={field.key} className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
                  {field.label}
                </span>

                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-2 py-1.5">
                  <input
                    type="color"
                    value={customThemeColors[field.key]}
                    onChange={(event) => onChangeCustomThemeColor(field.key, event.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  />

                  <span className="rounded-md bg-black/25 px-2 py-1 text-xs text-[#dbdee1]">
                    {customThemeColors[field.key].toUpperCase()}
                  </span>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onResetCustomTheme}>
              Reset
            </Button>
            <Button type="button" onClick={() => setIsCustomThemeModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
