/** A sentence split around the file name it mentions, for rendering the name on its own. */
export interface FileNameMention {
  readonly before: string;
  readonly after: string;
}

/**
 * Split a sentence around its first mention of `fileName`, so the name can be
 * rendered as its own control. Returns null when there is no mention or no name.
 */
export function splitAroundFileName(text: string, fileName: string): FileNameMention | null {
  const at = fileName.length === 0 ? -1 : text.indexOf(fileName);
  if (at === -1) {
    return null;
  }
  return { before: text.slice(0, at), after: text.slice(at + fileName.length) };
}

/**
 * Return the sentence a partner should see for a failure. Electron prefixes
 * main-process errors with the IPC channel and error kind, which are stripped;
 * a non-Error, or one empty once stripped, reads as `fallback`.
 */
export function friendlyMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const message = error.message
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(?:[A-Za-z]*Error):\s*/, "")
    .trim();
  return message.length > 0 ? message : fallback;
}
