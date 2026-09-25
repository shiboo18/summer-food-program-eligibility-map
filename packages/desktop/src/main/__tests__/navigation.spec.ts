import { describe, expect, test } from "vitest";

import { isAllowedExternalLink, isAllowedNavigation } from "../navigation.js";

describe("isAllowedNavigation", () => {
  const rendererUrl = "file:///tmp/Sponsor%20Tool/index.html";

  test("allows only the normalized renderer file", () => {
    expect(isAllowedNavigation("file:///tmp/Sponsor%20Tool/index.html", rendererUrl)).toBe(true);
    expect(isAllowedNavigation("file:///tmp/Sponsor Tool/index.html", rendererUrl)).toBe(true);
  });

  test.each(["https://example.com", "file:///tmp/other.html", "not a URL"])("blocks %s", (target) => {
    expect(isAllowedNavigation(target, rendererUrl)).toBe(false);
  });
});

describe("isAllowedExternalLink", () => {
  test("allows the Smarty secret-key link", () => {
    expect(
      isAllowedExternalLink("https://www.smarty.com/account/keys?account_id=17430621318&tab=secret"),
    ).toBe(true);
  });

  test.each([
    "http://www.smarty.com/account/keys",
    "https://www.smarty.com.evil.example/account/keys",
    "https://console.aws.amazon.com/location/api-keys/home",
    "https://example.com",
    "not a URL",
  ])("blocks unapproved link %s", (url) => {
    expect(isAllowedExternalLink(url)).toBe(false);
  });
});
