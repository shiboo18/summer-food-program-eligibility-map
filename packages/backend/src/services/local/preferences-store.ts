import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  defaultPreferences,
  mappingFields,
  themeModes,
  type AppAccessibilitySettings,
  type AppPreferences,
  type CachedColumnMapping,
  type ThemeMode,
} from "../../types/preferences.js";

/**
 * Header cells such as `A1`. Values that are not cells are dropped, which also
 * clears column names saved by earlier versions that stored names instead.
 */
const headerCellPattern = /^[A-Za-z]{1,3}[0-9]{1,7}$/;

function isHeaderCell(value: unknown): value is string {
  return typeof value === "string" && headerCellPattern.test(value.trim());
}

export class AppPreferenceStore {
  public constructor(private readonly filePath: string) {}

  /**
   * The stored preferences, or the defaults when there is nothing usable to read.
   * A file left truncated by a crash mid-write counts as nothing usable: these are
   * remembered answers, so starting over is always better than refusing to start.
   */
  public async get(): Promise<AppPreferences> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, "utf8");
    } catch {
      return defaultPreferences;
    }
    try {
      return parsePreferences(JSON.parse(contents));
    } catch {
      return defaultPreferences;
    }
  }

  /**
   * Replace the preferences named in the patch. A grouped preference is replaced
   * whole rather than merged, so a caller changing one field of a group sends the
   * rest of that group with it.
   */
  public async update(patch: unknown): Promise<AppPreferences> {
    const current = await this.get();
    const next = parsePreferences({ ...current, ...parsePatch(patch) });
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    return next;
  }
}

/** Keeps only the fields preferences actually have, so an unknown key cannot be stored. */
function parsePatch(value: unknown): Partial<AppPreferences> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Preferences are invalid.");
  }
  const source = value as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(defaultPreferences)) {
    if (key in source) {
      patch[key] = source[key];
    }
  }
  return patch as Partial<AppPreferences>;
}

/** Every field falls back to its default, so an unreadable file reads as the defaults. */
function parsePreferences(value: unknown): AppPreferences {
  const source = asRecord(value);
  return {
    accessibility: parseAccessibility(source.accessibility),
    columnMapping: parseColumnMapping(source.columnMapping),
    checkSelection: parseFlags(source.checkSelection, defaultPreferences.checkSelection),
  };
}

/** A stored value read as a keyed group; anything that is not an object reads as empty. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Reads a group of stored flags, keeping the default for each one missing or not a boolean. */
function parseFlags<Flags extends Readonly<Record<keyof Flags, boolean>>>(
  value: unknown,
  fallback: Flags,
): Flags {
  const source = asRecord(value);
  const presets = fallback as Readonly<Record<string, boolean>>;
  return Object.fromEntries(
    Object.entries(presets).map(([flag, preset]) => [flag, asBoolean(source[flag], preset)]),
  ) as Flags;
}

function parseAccessibility(value: unknown): AppAccessibilitySettings {
  const source = asRecord(value);
  const fallback = defaultPreferences.accessibility;
  return {
    theme: isThemeMode(source.theme) ? source.theme : fallback.theme,
    ...parseFlags(source, { highContrast: fallback.highContrast, reduceMotion: fallback.reduceMotion }),
  };
}

/** Keeps only known fields whose value is a header cell. */
function parseColumnMapping(value: unknown): CachedColumnMapping {
  const source = asRecord(value);
  const mapping: Record<string, string> = {};
  for (const field of mappingFields) {
    const cell = source[field];
    if (isHeaderCell(cell)) {
      mapping[field] = cell.trim().toUpperCase();
    }
  }
  return mapping;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (themeModes as readonly string[]).includes(value);
}
