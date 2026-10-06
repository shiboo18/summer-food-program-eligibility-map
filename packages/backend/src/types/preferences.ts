/** The shape of stored user preferences. Parsing and file access live in preferences-store.ts. */

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
 * position usually does not. Every field is optional.
 */
export type CachedColumnMapping = Readonly<Partial<Record<(typeof mappingFields)[number], string>>>;

/**
 * The optional USDA checks the user last ran. Address validation is always
 * required, so it is not cached: it cannot be turned off.
 */
export interface CachedCheckSelection {
  readonly rural: boolean;
  readonly area: boolean;
}

/** How the app is drawn and how much it moves. */
export interface AppAccessibilitySettings {
  readonly theme: ThemeMode;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
}

export interface AppPreferences {
  readonly accessibility: AppAccessibilitySettings;
  readonly columnMapping: CachedColumnMapping;
  readonly checkSelection: CachedCheckSelection;
}

export const defaultPreferences: AppPreferences = {
  accessibility: { theme: "system", highContrast: false, reduceMotion: false },
  columnMapping: {},
  checkSelection: { rural: false, area: false },
};
