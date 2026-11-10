import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

import { systemNotifier } from "../notifier.js";

const rendererRoot = fileURLToPath(new URL("..", import.meta.url));

/** Every renderer source file, tests excluded. */
function rendererSources(directory = rendererRoot): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : rendererSources(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("systemNotifier", () => {
  function stubWindow(confirmAnswer: boolean) {
    const window = { alert: vi.fn(), confirm: vi.fn(() => confirmAnswer) };
    vi.stubGlobal("window", window);
    return window;
  }

  test.each(["success", "failure"] as const)("shows a %s as the system's own pop-up", (kind) => {
    const window = stubWindow(true);

    systemNotifier[kind]("Credentials saved securely.");

    expect(window.alert).toHaveBeenCalledWith("Credentials saved securely.");
  });

  test.each([true, false])("passes on the partner's answer to a question: %s", (answer) => {
    const window = stubWindow(answer);

    const agreed = systemNotifier.confirm("Clear stored Smarty credentials?");

    expect(agreed).toBe(answer);
    expect(window.confirm).toHaveBeenCalledWith("Clear stored Smarty credentials?");
  });
});

/* So every pop-up looks and behaves the same. */
test("only the notifier shows the system's pop-ups", () => {
  const callers = rendererSources()
    .filter((path) => !path.endsWith("notifier.ts"))
    /* The browser's own calls, whether through `window.` or bare; a notifier's
       `confirm` is a method call on something else, so it is not one of them. */
    .filter((path) => /(?:\bwindow\.|(?<![\w.]))(?:alert|confirm)\s*\(/.test(readFileSync(path, "utf8")))
    .map((path) => relative(rendererRoot, path));

  expect(callers).toEqual([]);
});
