import type { BrowserWindowConstructorOptions } from "electron";

export function createWindowOptions(preloadPath: string, iconPath: string): BrowserWindowConstructorOptions {
  return {
    // 1920x1080 leads desktop share, but 1366x768 is still the smallest common
    // screen (usable height ~728px after OS chrome). A 1200x740 default fits
    // inside that with margin, reads as a comfortable 16:10-ish app window on
    // 1080p and larger, and is centered so it never opens against a corner.
    width: 1200,
    height: 740,
    minWidth: 900,
    minHeight: 620,
    center: true,
    show: false,
    title: "vibeCheck",
    icon: iconPath,
    backgroundColor: "#fffaf6",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  };
}
