import { describe, expect, test } from "vitest";

import { defaultPreferences, type AppPreferences } from "../../types/preferences.js";
import { PreferencesService, type PreferenceRecordStore } from "../preferences-service.js";

/** An in-memory stand-in that applies patches the way the real store does. */
function createStore(initial: AppPreferences = defaultPreferences): PreferenceRecordStore {
  let current = initial;
  return {
    get: async () => current,
    update: async (patch: unknown) => {
      current = { ...current, ...(patch as Partial<AppPreferences>) };
      return current;
    },
  };
}

describe("PreferencesService", () => {
  test("reads every preference", async () => {
    const service = new PreferencesService(createStore());
    await expect(service.readAll()).resolves.toEqual(defaultPreferences);
  });

  test("reads a single preference", async () => {
    const service = new PreferencesService(
      createStore({ ...defaultPreferences, checkSelection: { rural: true, area: false } }),
    );
    await expect(service.read("checkSelection")).resolves.toEqual({ rural: true, area: false });
  });

  test("creates and updates through one write", async () => {
    const service = new PreferencesService(createStore());

    await service.write({ columnMapping: { line1: "Street" } });
    const updated = await service.write({ columnMapping: { line1: "Address Line#1" } });

    expect(updated.columnMapping).toEqual({ line1: "Address Line#1" });
  });

  test("removing a preference restores its default", async () => {
    const service = new PreferencesService(
      createStore({ ...defaultPreferences, columnMapping: { line1: "Street" }, checkSelection: { rural: true, area: false } }),
    );

    const updated = await service.remove("columnMapping");

    expect(updated.columnMapping).toEqual({});
    // Unrelated preferences are untouched.
    expect(updated.checkSelection).toEqual({ rural: true, area: false });
  });

  test("resetting restores every default", async () => {
    const service = new PreferencesService(
      createStore({ ...defaultPreferences, checkSelection: { rural: true, area: true }, columnMapping: { line1: "A1" } }),
    );

    await expect(service.reset()).resolves.toEqual(defaultPreferences);
  });

  test("refuses a preference name it does not own", async () => {
    const service = new PreferencesService(createStore());

    await expect(service.remove("__proto__")).rejects.toThrow("That preference does not exist.");
    await expect(service.remove("smartyAuthToken")).rejects.toThrow("That preference does not exist.");
    await expect(service.remove(undefined)).rejects.toThrow("That preference does not exist.");
  });
});
