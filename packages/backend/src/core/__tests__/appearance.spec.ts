import { describe, expect, test } from "vitest";

import { resolveAppearance } from "../appearance.js";

describe("resolveAppearance", () => {
  test("follows the system theme when set to system", () => {
    const applied = resolveAppearance(
      { theme: "system", highContrast: false, reduceMotion: false },
      "dark",
      false,
    );
    expect(applied.theme).toBe("dark");
  });

  test("uses the explicit theme over the system theme", () => {
    const applied = resolveAppearance(
      { theme: "light", highContrast: true, reduceMotion: false },
      "dark",
      false,
    );
    expect(applied).toEqual({ theme: "light", highContrast: true, reduceMotion: false });
  });

  test("reduces motion when either preference or system requests it", () => {
    expect(
      resolveAppearance({ theme: "light", highContrast: false, reduceMotion: false }, "light", true)
        .reduceMotion,
    ).toBe(true);
    expect(
      resolveAppearance({ theme: "light", highContrast: false, reduceMotion: true }, "light", false)
        .reduceMotion,
    ).toBe(true);
  });
});
