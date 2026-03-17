"use client"

import * as React from "react"
import { Circle, Moon, Palette, Sun } from "lucide-react"
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
]

export const ModeToggle = () => {
  const { setTheme, theme } = useTheme()
  const [isCustomThemeModalOpen, setIsCustomThemeModalOpen] = React.useState(false)
  const [customThemeColors, setCustomThemeColors] = React.useState<CustomThemeColors>(defaultCustomThemeColors)

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
