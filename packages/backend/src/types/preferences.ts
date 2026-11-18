import type { EligibilityChecks } from "./eligibility.js";

export const themeModes = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof themeModes)[number];

/** Fields whose chosen header cell is cached between runs. */
export const mappingFields = [
  "line1",
  "line2",
  "city",
  "state",
  "postalCode",
] as const;

/**
 * The header cell the user pinned for each field, such as `A1`. Cells are cached
 * rather than column names because names differ between files while the column
 * position usually does not.
 */
export type CachedColumnMapping = Readonly<Partial<Record<(typeof mappingFields)[number], string>>>;

/** How the app is drawn and how much it moves. */
export interface AppAccessibilitySettings {
  readonly theme: ThemeMode;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
}

export interface Preferences {
  readonly accessibility: AppAccessibilitySettings;
  readonly columnMapping: CachedColumnMapping;
  /** The USDA checks the user last ran. The address check always runs, so it is not cached. */
  readonly checkSelection: EligibilityChecks;
}

export const defaultPreferences: Preferences = {
  accessibility: { theme: "system", highContrast: false, reduceMotion: false },
  columnMapping: {},
  checkSelection: { rural: false, area: false },
};
