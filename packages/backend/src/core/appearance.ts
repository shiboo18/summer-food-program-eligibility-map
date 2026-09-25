import type { AppAccessibilitySettings } from "../types/preferences.js";

export interface AppliedAppearance {
  readonly theme: "light" | "dark";
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
}

export function resolveAppearance(
  settings: AppAccessibilitySettings,
  systemTheme: "light" | "dark",
  systemReduceMotion: boolean,
): AppliedAppearance {
  return {
    theme: settings.theme === "system" ? systemTheme : settings.theme,
    highContrast: settings.highContrast,
    reduceMotion: settings.reduceMotion || systemReduceMotion,
  };
}
