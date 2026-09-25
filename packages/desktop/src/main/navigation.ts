import { fileURLToPath } from "node:url";

export function isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const renderer = new URL(rendererUrl);
    return target.protocol === "file:" && fileURLToPath(target) === fileURLToPath(renderer);
  } catch {
    return false;
  }
}

export function isAllowedExternalLink(targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    return target.protocol === "https:" && target.hostname === "www.smarty.com";
  } catch {
    return false;
  }
}
