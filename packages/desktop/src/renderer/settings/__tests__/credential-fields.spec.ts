import { describe, expect, test } from "vitest";

import { credentialFields } from "../credential-fields.js";

describe("credentialFields", () => {
  test("lists both Smarty secrets in form order", () => {
    expect(credentialFields.map((entry) => entry.name)).toEqual(["smartyAuthId", "smartyAuthToken"]);
  });

  test("labels each field the way Smarty names it", () => {
    expect(credentialFields.map((entry) => entry.label)).toEqual(["AUTH_ID", "AUTH_TOKEN"]);
  });
});
