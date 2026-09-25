import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import { AppPreferenceStore as PreferencesStore } from "../preferences-store.js";
import { defaultPreferences } from "../../../types/preferences.js";

const directories: string[] = [];

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "share-our-strengths-prefs-"));
  directories.push(directory);
  return join(directory, "preferences.json");
}

async function createStore(): Promise<PreferencesStore> {
  return new PreferencesStore(await createStorePath());
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("PreferencesStore", () => {
  test("returns defaults when no file exists", async () => {
    const store = await createStore();
    await expect(store.get()).resolves.toEqual(defaultPreferences);
  });

  test("returns defaults when the stored file was truncated mid-write", async () => {
    const filePath = await createStorePath();
    await writeFile(filePath, '{"columnMapping":tr', "utf8");

    await expect(new PreferencesStore(filePath).get()).resolves.toEqual(defaultPreferences);
  });

  test("returns defaults when the stored file is empty", async () => {
    const filePath = await createStorePath();
    await writeFile(filePath, "", "utf8");

    await expect(new PreferencesStore(filePath).get()).resolves.toEqual(defaultPreferences);
  });

  test("replaces an unreadable stored file on the next update rather than staying stuck", async () => {
    const filePath = await createStorePath();
    await writeFile(filePath, "{oops", "utf8");

    const updated = await new PreferencesStore(filePath).update({ columnMapping: { line1: "A1" } });

    expect(updated.columnMapping).toEqual({ line1: "A1" });
    await expect(new PreferencesStore(filePath).get()).resolves.toEqual({
      ...defaultPreferences,
      columnMapping: { line1: "A1" },
    });
  });

  test("applies and persists a partial update", async () => {
    const store = await createStore();

    const updated = await store.update({
      accessibility: { theme: "dark", highContrast: false, reduceMotion: true },
    });

    expect(updated).toEqual({
      ...defaultPreferences,
      accessibility: { theme: "dark", highContrast: false, reduceMotion: true },
    });
    await expect(store.get()).resolves.toEqual(updated);
  });

  test("restores a default for an accessibility setting the patch leaves out", async () => {
    const store = await createStore();
    await store.update({ accessibility: { theme: "dark", highContrast: true, reduceMotion: true } });

    const updated = await store.update({ accessibility: { theme: "light" } as never });

    expect(updated.accessibility).toEqual({ theme: "light", highContrast: false, reduceMotion: false });
  });

  test("remembers the column mapping and reuses it on the next read", async () => {
    const store = await createStore();

    const updated = await store.update({
      columnMapping: { line1: "A1", city: "C1", state: "D1", postalCode: "E1" },
    });

    expect(updated.columnMapping).toEqual({ line1: "A1", city: "C1", state: "D1", postalCode: "E1" });
    await expect(store.get()).resolves.toMatchObject({ columnMapping: updated.columnMapping });
  });

  test("keeps only usable header cells in a cached mapping", async () => {
    const store = await createStore();

    const updated = await store.update({
      columnMapping: {
        line1: "a1",
        city: "   ",
        state: 42,
        postalCode: "Z".repeat(300),
        nonsense: "ignored",
      } as never,
    });

    expect(updated.columnMapping).toEqual({ line1: "A1" });
  });

  test("drops column names stored by earlier versions", async () => {
    const store = await createStore();

    const updated = await store.update({
      columnMapping: { line1: "Address Line#1", city: "City", state: "State", postalCode: "Zip" },
    });

    expect(updated.columnMapping).toEqual({});
  });

  test("falls back to an empty mapping when the stored value is not an object", async () => {
    const store = await createStore();
    await expect(store.update({ columnMapping: "nope" as never })).resolves.toMatchObject({
      columnMapping: {},
    });
  });

  test("updating one cached preference leaves the other intact", async () => {
    const store = await createStore();
    await store.update({ columnMapping: { line1: "A1" } });

    const updated = await store.update({
      accessibility: { theme: "dark", highContrast: false, reduceMotion: false },
    });

    expect(updated.columnMapping).toEqual({ line1: "A1" });
    expect(updated.accessibility).toEqual({ theme: "dark", highContrast: false, reduceMotion: false });
  });

  test("ignores an unknown theme value", async () => {
    const store = await createStore();

    const updated = await store.update({
      accessibility: { theme: "neon", highContrast: false, reduceMotion: false } as never,
    });

    expect(updated.accessibility.theme).toBe("system");
  });

});
