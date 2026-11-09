import { describe, expect, test } from "vitest";

import { SMARTY_API_KEYS_URL } from "../../../../backend/dist/config/constants.js";
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
  test("allows the link to the partner's Smarty keys", () => {
    const allowed = isAllowedExternalLink(SMARTY_API_KEYS_URL);

    expect(allowed).toBe(true);
  });

  /* An account id in the link would send every partner to one account's keys. */
  test("links to whichever Smarty account the partner signs in to", () => {
    const link = new URL(SMARTY_API_KEYS_URL);

    expect(`${link.origin}${link.pathname}`).toBe("https://www.smarty.com/account/keys");
    expect(link.searchParams.has("account_id")).toBe(false);
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
