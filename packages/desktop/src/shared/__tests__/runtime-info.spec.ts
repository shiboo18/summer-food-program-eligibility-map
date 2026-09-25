import { expect, test } from "vitest";

import { formatRuntimeSummary } from "../runtime-info.js";

test("formats the Electron runtime summary", () => {
  expect(
    formatRuntimeSummary({
      electron: "44.3.0",
      chromium: "142.0.0",
      node: "24.0.0",
      platform: "darwin",
    }),
  ).toBe("Electron 44.3.0 · Chromium 142.0.0 · Node.js 24.0.0");
});
