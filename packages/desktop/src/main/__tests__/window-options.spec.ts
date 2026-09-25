import { describe, expect, test } from "vitest";

import { createWindowOptions } from "../window-options.js";

describe("createWindowOptions", () => {
  test("applies vibeCheck branding and enables renderer isolation", () => {
    const options = createWindowOptions("/tmp/preload.cjs", "/tmp/vibecheck-icon.png");

    expect(options).toMatchObject({
      show: false,
      title: "vibeCheck",
      icon: "/tmp/vibecheck-icon.png",
    });
    expect(options.webPreferences).toMatchObject({
      preload: "/tmp/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });
});
