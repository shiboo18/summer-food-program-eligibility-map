import { describe, expect, test } from "vitest";

import { credentialHint } from "../credential-hints.js";

const emailHint =
  "That looks like your Smarty login. Use the Auth ID and Auth Token from a Smarty secret key instead: choose Open my Smarty keys above, sign in, and copy them.";
const authIdShapeHint =
  "An Auth ID usually looks like 8d497be5-e211-4949-a18f-0bfd1d9970d3. Copy it from your Smarty secret key.";

describe("credentialHint", () => {
  test.each([
    { case: "an email typed as the Auth ID", field: "smartyAuthId", value: "kerri@example.org" },
    { case: "an email typed as the Auth Token", field: "smartyAuthToken", value: "kerri@example.org" },
    { case: "an email still being typed", field: "smartyAuthId", value: "kerri@" },
    { case: "an email with stray spaces", field: "smartyAuthId", value: "  kerri@example.org " },
  ] as const)("points to the secret key for $case", ({ field, value }) => {
    const hint = credentialHint(field, value, false);

    expect(hint).toBe(emailHint);
  });

  test("explains what an Auth ID looks like once the partner leaves an odd-shaped one", () => {
    const hint = credentialHint("smartyAuthId", "hunter2password", true);

    expect(hint).toBe(authIdShapeHint);
  });

  /* Half-typed values are not mistakes yet. */
  test("says nothing about shape while the Auth ID is still being typed", () => {
    const hint = credentialHint("smartyAuthId", "8d497be5-e2", false);

    expect(hint).toBeUndefined();
  });

  test.each([
    { case: "a well-formed Auth ID", field: "smartyAuthId", value: "8d497be5-e211-4949-a18f-0bfd1d9970d3" },
    { case: "a well-formed Auth ID in capitals", field: "smartyAuthId", value: "8D497BE5-E211-4949-A18F-0BFD1D9970D3" },
    { case: "an empty Auth ID", field: "smartyAuthId", value: "   " },
    { case: "an Auth Token", field: "smartyAuthToken", value: "th4hargQiuyG7w7L7xfO" },
    { case: "an empty Auth Token", field: "smartyAuthToken", value: "" },
  ] as const)("says nothing for $case", ({ field, value }) => {
    const hint = credentialHint(field, value, true);

    expect(hint).toBeUndefined();
  });
});
