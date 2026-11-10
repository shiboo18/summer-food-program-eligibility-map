import type { CredentialCheck } from "../../../../backend/dist/index.js";
import type { Tone } from "../tone.js";

/** The stored key's state on screen: Smarty's last answer, or a check under way. */
export type CredentialDisplayState = CredentialCheck | "checking";

/** How the status reads at a glance; styling keys off this. */

export interface CredentialStatusView {
  /** The status line in Settings and in the credentials dialog. */
  readonly text: string;
  readonly tone: Tone;
  /** Why a run cannot start with the stored key; absent when it can. */
  readonly blocker?: string;
  /** What the home page says about the key, beside a link to Settings; present exactly when `blocker` is. */
  readonly homeNotice?: string;
  /** Why a key with this answer was not stored; absent when such a key is stored. */
  readonly refusedSave?: string;
}

/*
 * A key Smarty accepts needs no comment, so only a problem or a check under way
 * gets a status line. An unanswered check blocks nothing: the key may be fine,
 * and a run will say if not.
 */
const views: Readonly<Record<CredentialDisplayState, CredentialStatusView>> = {
  "not-set": {
    text: "Not set up yet",
    tone: "idle",
    blocker: "Add your Smarty secret key in Settings before running checks.",
    homeNotice: "Add your Smarty secret key to get started.",
  },
  checking: { text: "Checking with Smarty…", tone: "pending" },
  validated: { text: "", tone: "success" },
  rejected: {
    text: "Smarty didn't accept these. Use the Auth ID and Auth Token from a Smarty secret key, not your Smarty login.",
    tone: "error",
    blocker: "Smarty didn't accept your saved key. Update it in Settings before running checks.",
    homeNotice: "Smarty didn't accept your saved key. Update it to get started.",
    refusedSave:
      "Smarty didn't accept this key, so it wasn't saved. Use the Auth ID and Auth Token from a Smarty secret key, not your Smarty login.",
  },
  "no-subscription": {
    text: "Smarty has no active subscription for this account.",
    tone: "error",
    blocker: "Smarty has no active subscription for this account, so checks can't run.",
    homeNotice: "Smarty has no active subscription for this account, so checks can't run.",
    refusedSave: "Smarty has no active subscription for this account, so the key wasn't saved.",
  },
  unreachable: { text: "Couldn't reach Smarty to validate. Check your connection.", tone: "warning" },
};

export function credentialStatusView(state: CredentialDisplayState): CredentialStatusView {
  return views[state];
}
