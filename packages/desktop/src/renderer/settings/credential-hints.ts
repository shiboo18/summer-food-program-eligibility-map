import type { SmartyCredentialField } from "../../../../backend/dist/index.js";

/* Partners type their Smarty sign-in here instead of the secret key, so an email
   address is the mistake worth catching the moment it appears. */
const emailHint =
  "That looks like your Smarty login. Use the Auth ID and Auth Token from a Smarty secret key instead: choose Open my Smarty keys above, sign in, and copy them.";

const authIdShapeHint =
  "An Auth ID usually looks like 8d497be5-e211-4949-a18f-0bfd1d9970d3. Copy it from your Smarty secret key.";

/** Smarty's Auth IDs are UUIDs in every example it publishes. */
const authIdShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Return a coach mark for what has been typed into a credential field, or
 * `undefined` when there is nothing to say. Advice only: it never blocks a
 * save, which Smarty itself checks.
 *
 * @param settled true once the partner has left the field, so a half-typed
 *   value is not mistaken for a wrong one.
 */
export function credentialHint(field: SmartyCredentialField, value: string, settled: boolean): string | undefined {
  const typed = value.trim();
  if (typed.includes("@")) {
    return emailHint;
  }
  if (field === "smartyAuthId" && settled && typed !== "" && !authIdShape.test(typed)) {
    return authIdShapeHint;
  }
  return undefined;
}
