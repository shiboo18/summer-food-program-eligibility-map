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

/** How the app is drawn and how much it moves. */
export interface AppAccessibilitySettings {
  readonly theme: ThemeMode;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
}

export interface AppPreferences {
  readonly accessibility: AppAccessibilitySettings;
  readonly columnMapping: CachedColumnMapping;
}

export const defaultPreferences: AppPreferences = {
  accessibility: { theme: "system", highContrast: false, reduceMotion: false },
  columnMapping: {},
};
