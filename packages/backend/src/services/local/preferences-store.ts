import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isCellReference } from "../../core/cell-reference.js";

import {
  defaultPreferences,
  mappingFields,
  themeModes,
  type AppAccessibilitySettings,
  type Preferences,
  type CachedColumnMapping,
  type ThemeMode,
} from "../../types/preferences.js";

/** Header cells such as `A1`. Anything else, including a stored column name, is dropped. */
function isHeaderCell(value: unknown): value is string {
  return typeof value === "string" && isCellReference(value);
}

export class PreferencesStore {
  public constructor(private readonly filePath: string) {}

  /**
   * Return the stored preferences, or the defaults when nothing usable can be read,
   * such as a file truncated mid-write. These are remembered answers, so starting
   * over is better than refusing to start.
   */
  public async get(): Promise<Preferences> {
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
   * whole, not merged, so a caller changing one field sends the rest of its group.
   */
  public async update(patch: unknown): Promise<Preferences> {
    const current = await this.get();
    const next = parsePreferences({ ...current, ...parsePatch(patch) });
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    return next;
  }
}

/** Keeps only the fields preferences actually have, so an unknown key cannot be stored. */
function parsePatch(value: unknown): Partial<Preferences> {
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
  return patch as Partial<Preferences>;
}

/** Every field falls back to its default, so an unreadable file reads as the defaults. */
function parsePreferences(value: unknown): Preferences {
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
