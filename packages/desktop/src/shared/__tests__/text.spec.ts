import { describe, expect, test } from "vitest";

import { friendlyMessage, splitAroundFileName } from "../text.js";

describe("splitAroundFileName", () => {
  const fileName = "Union County PII removed.xlsx";

  test("splits a sentence that ends with the file name and its full stop", () => {
    expect(splitAroundFileName(`Match each address field to a column in ${fileName}.`, fileName)).toEqual({
      before: "Match each address field to a column in ",
      after: ".",
    });
  });

  test("splits a sentence that opens with the file name", () => {
    expect(splitAroundFileName(`${fileName} is loaded. Upload another to start over.`, fileName)).toEqual({
      before: "",
      after: " is loaded. Upload another to start over.",
    });
  });

  test("splits on the first mention only, leaving a second in the remainder", () => {
    expect(splitAroundFileName(`${fileName} and ${fileName}`, fileName)).toEqual({
      before: "",
      after: ` and ${fileName}`,
    });
  });

  test("returns null for a sentence that does not mention the file", () => {
    expect(splitAroundFileName("Upload a file to map its columns.", fileName)).toBe(null);
  });

  test("returns null when the mention differs in case, since the name is shown verbatim", () => {
    expect(splitAroundFileName("A column in union county pii removed.xlsx.", fileName)).toBe(null);
  });

  test("returns null for an empty file name, which every sentence would match", () => {
    expect(splitAroundFileName("Upload a file to map its columns.", "")).toBe(null);
  });
});

describe("friendlyMessage", () => {
  const fallback = "Unable to update settings.";

  /* Electron wraps every error thrown in the main process this way; the partner
     only needs the sentence at the end. */
  test.each([
    {
      case: "an error from the main process",
      error: new Error(
        "Error invoking remote method 'settings:save': Error: Secure credential storage is unavailable on this device.",
      ),
      expected: "Secure credential storage is unavailable on this device.",
    },
    {
      case: "a main-process error of another kind",
      error: new Error("Error invoking remote method 'preferences:update': TypeError: Preferences are invalid."),
      expected: "Preferences are invalid.",
    },
    { case: "a plain error", error: new Error("Street address needs a header cell such as A1."), expected: "Street address needs a header cell such as A1." },
    { case: "an error whose message is only its kind", error: new Error("Error: "), expected: fallback },
    { case: "an error with no message", error: new Error(""), expected: fallback },
    { case: "a thrown string", error: "x", expected: fallback },
    { case: "nothing thrown at all", error: undefined, expected: fallback },
  ])("reads $case as the partner should see it", ({ error, expected }) => {
    const message = friendlyMessage(error, fallback);

    expect(message).toBe(expected);
  });
});
