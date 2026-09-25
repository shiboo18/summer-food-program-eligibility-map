/** A sentence split around the file name it mentions, for rendering the name on its own. */
export interface FileNameMention {
  readonly before: string;
  readonly after: string;
}

/**
 * Splits a sentence around its first mention of `fileName`, so the name can be
 * rendered as its own control rather than as plain text. Returns null when there is
 * nothing to split: no mention, or no name.
 */
export function splitAroundFileName(text: string, fileName: string): FileNameMention | null {
  const at = fileName.length === 0 ? -1 : text.indexOf(fileName);
  if (at === -1) {
    return null;
  }
  return { before: text.slice(0, at), after: text.slice(at + fileName.length) };
}
