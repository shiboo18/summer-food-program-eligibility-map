import type { BrowserWindowConstructorOptions } from "electron";

export function createWindowOptions(preloadPath: string, iconPath: string): BrowserWindowConstructorOptions {
  return {
    // Fits the smallest common screen, 1366x768 (about 728px usable height), with
    // margin, and is centered so it never opens against a corner.
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
