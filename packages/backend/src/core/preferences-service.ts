import { defaultPreferences, type AppPreferences } from "../types/preferences.js";

/** The persistence this service reads and writes through. */
export interface PreferenceRecordStore {
  get(): Promise<AppPreferences>;
  update(patch: unknown): Promise<AppPreferences>;
}

export type PreferenceKey = keyof AppPreferences;

const preferenceKeys = Object.keys(defaultPreferences) as readonly PreferenceKey[];

/**
 * CRUD over stored user preferences.
 *
 * Create and update are one operation: every preference always has a value, so
 * writing either introduces one or replaces it. Delete restores the default
 * rather than removing the field, which keeps the stored record complete.
 */
export class PreferencesService {
  public constructor(private readonly store: PreferenceRecordStore) {}

  /** Read every preference. */
  public async readAll(): Promise<AppPreferences> {
    return this.store.get();
  }

  /** Read a single preference. */
  public async read<Key extends PreferenceKey>(key: Key): Promise<AppPreferences[Key]> {
    const preferences = await this.store.get();
    return preferences[key];
  }

  /** Create or update preferences from an untrusted patch. */
  public async write(patch: unknown): Promise<AppPreferences> {
    return this.store.update(patch);
  }

  /** Restore a single preference to its default. */
  public async remove(key: unknown): Promise<AppPreferences> {
    const field = assertPreferenceKey(key);
    return this.store.update({ [field]: defaultPreferences[field] });
  }

  /** Restore every preference to its default. */
  public async reset(): Promise<AppPreferences> {
    return this.store.update(defaultPreferences);
  }
}

function assertPreferenceKey(key: unknown): PreferenceKey {
  if (typeof key !== "string" || !(preferenceKeys as readonly string[]).includes(key)) {
    throw new Error("That preference does not exist.");
  }
  return key as PreferenceKey;
}
