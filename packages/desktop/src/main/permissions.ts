/** The Electron permission handler, narrowed to what a deny-everything policy needs. */
export type PermissionRequestHandler = (
  contents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
) => void;

/** The part of an Electron session this policy configures. */
export interface PermissionSession {
  setPermissionRequestHandler(handler: PermissionRequestHandler | null): void;
  setPermissionCheckHandler(handler: (() => boolean) | null): void;
}

/**
 * Refuses every web permission for the session. The app reads a workbook the
 * partner picks through a native dialog, so nothing in the renderer needs the
 * camera, microphone, location, notifications, or the clipboard; a page that
 * somehow loaded there must not be able to ask for them either.
 */
export function denyAllPermissions(session: PermissionSession): void {
  session.setPermissionRequestHandler((_contents, _permission, callback): void => {
    callback(false);
  });
  session.setPermissionCheckHandler((): boolean => false);
}
