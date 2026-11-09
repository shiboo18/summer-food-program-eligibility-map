import { describe, expect, test } from "vitest";

import { credentialStatusView, type CredentialDisplayState } from "../credential-status-text.js";

const everyState: readonly CredentialDisplayState[] = [
  "not-set",
  "checking",
  "validated",
  "rejected",
  "no-subscription",
  "unreachable",
];

describe("credentialStatusView", () => {
  test.each([
    {
      state: "not-set",
      view: {
        text: "Not set up yet",
        tone: "idle",
        blocker: "Add your Smarty secret key in Settings before running checks.",
      },
    },
    { state: "checking", view: { text: "Checking with Smarty…", tone: "pending" } },
    /* A working key needs no comment; only a problem earns a status line. */
    { state: "validated", view: { text: "", tone: "success" } },
    {
      state: "rejected",
      view: {
        text: "Smarty didn't accept these. Use the Auth ID and Auth Token from a Smarty secret key, not your Smarty login.",
        tone: "error",
        blocker: "Smarty didn't accept your saved key. Update it in Settings before running checks.",
        homeNotice: "Smarty didn't accept your saved key. Update it in Settings before you start.",
        refusedSave:
          "Smarty didn't accept this key, so it wasn't saved. Use the Auth ID and Auth Token from a Smarty secret key, not your Smarty login.",
      },
    },
    {
      state: "no-subscription",
      view: {
        text: "Smarty has no active subscription for this account.",
        tone: "error",
        blocker: "Smarty has no active subscription for this account, so checks can't run.",
        homeNotice: "Smarty has no active subscription for this account, so checks can't run.",
        refusedSave: "Smarty has no active subscription for this account, so the key wasn't saved.",
      },
    },
    {
      state: "unreachable",
      view: { text: "Couldn't reach Smarty to validate. Check your connection.", tone: "warning" },
    },
  ] satisfies readonly { state: CredentialDisplayState; view: object }[])(
    "describes $state",
    ({ state, view }) => {
      const result = credentialStatusView(state);

      expect(result).toEqual(view);
    },
  );

  /* Partners read "configured" and a check mark as "working"; neither may return. */
  test.each(everyState)("never says configured or shows a check mark for %s", (state) => {
    const { text, blocker = "", homeNotice = "", refusedSave = "" } = credentialStatusView(state);

    const everything = `${text} ${blocker} ${homeNotice} ${refusedSave}`;

    expect(everything.toLowerCase()).not.toContain("configured");
    expect(everything).not.toContain("✓");
  });

  /* A key Smarty refused, or one that is not there, cannot run; an unanswered
     check must not hold the partner up. */
  test.each([
    { state: "not-set", blocks: true },
    { state: "rejected", blocks: true },
    { state: "no-subscription", blocks: true },
    { state: "checking", blocks: false },
    { state: "validated", blocks: false },
    { state: "unreachable", blocks: false },
  ] satisfies readonly { state: CredentialDisplayState; blocks: boolean }[])(
    "a run with the key $state is blocked: $blocks",
    ({ state, blocks }) => {
      const { blocker } = credentialStatusView(state);

      expect(blocker !== undefined).toBe(blocks);
    },
  );
});
