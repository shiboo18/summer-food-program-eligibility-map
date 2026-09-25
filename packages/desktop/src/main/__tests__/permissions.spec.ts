import { describe, expect, test, vi } from "vitest";

import { denyAllPermissions, type PermissionRequestHandler, type PermissionSession } from "../permissions.js";

function createSession() {
  const handlers: { request?: PermissionRequestHandler; check?: () => boolean } = {};
  const session: PermissionSession = {
    setPermissionRequestHandler: (handler): void => {
      handlers.request = handler ?? undefined;
    },
    setPermissionCheckHandler: (handler): void => {
      handlers.check = handler ?? undefined;
    },
  };
  return { session, handlers };
}

/* Every permission Electron can ask about that this app has no use for. */
const permissions = ["media", "geolocation", "notifications", "clipboard-read", "openExternal", "midi"];

describe("denyAllPermissions", () => {
  test("refuses every permission the renderer asks for", () => {
    const { session, handlers } = createSession();
    denyAllPermissions(session);
    const granted: boolean[] = [];

    for (const permission of permissions) {
      handlers.request?.(null, permission, (allowed) => granted.push(allowed));
    }

    expect(granted).toEqual(permissions.map(() => false));
  });

  test("reports every permission as unheld when one is checked rather than requested", () => {
    const { session, handlers } = createSession();
    denyAllPermissions(session);

    expect(handlers.check?.()).toBe(false);
  });

  test("installs both handlers, so neither route is left at Electron's default", () => {
    const session: PermissionSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    };

    denyAllPermissions(session);

    expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
  });
});
