import { contextBridge, ipcRenderer } from "electron";

/* Type-only imports are erased at compile time, so the contracts stay in one
   place without giving this CommonJS preload a runtime dependency. */
import type {
  ColumnMapping,
  CredentialInput,
  CredentialStatus,
  EligibilityChecks,
  EligibilityReport,
  Preferences,
  RunProgress,
  ValidationReport,
} from "../../../backend/dist/index.js";

/** Main-process projections that exist only for this bridge. */
interface SpreadsheetSelection {
  readonly fileName: string;
  readonly headers: readonly string[];
  readonly headerRowNumber: number;
  readonly rowCount: number;
}

interface ExportResult {
  readonly canceled: boolean;
  readonly filePath?: string;
  readonly rowsAnnotated?: number;
}

const runtimeInfo = Object.freeze({
  electron: process.versions.electron ?? "unknown",
  chromium: process.versions.chrome ?? "unknown",
  node: process.versions.node,
  platform: process.platform,
});

contextBridge.exposeInMainWorld(
  "shareOurStrengths",
  Object.freeze({
    getRuntimeInfo: () => runtimeInfo,
    spreadsheet: Object.freeze({
      open: () => ipcRenderer.invoke("spreadsheet:open") as Promise<SpreadsheetSelection | null>,
      reveal: (fileName: string) => ipcRenderer.invoke("spreadsheet:reveal", fileName) as Promise<void>,
      validate: (fileName: string, mapping: ColumnMapping) =>
        ipcRenderer.invoke("spreadsheet:validate", { fileName, mapping }) as Promise<ValidationReport>,
    }),
    eligibility: Object.freeze({
      check: (fileName: string, mapping: ColumnMapping, checks: EligibilityChecks) =>
        ipcRenderer.invoke("eligibility:check", { fileName, mapping, checks }) as Promise<EligibilityReport>,
    }),
    results: Object.freeze({
      export: (fileName: string) =>
        ipcRenderer.invoke("results:export", { fileName }) as Promise<ExportResult>,
      reveal: (fileName: string) => ipcRenderer.invoke("results:reveal", fileName) as Promise<void>,
    }),
    run: Object.freeze({
      onProgress: (listener: (progress: RunProgress) => void) => {
        const handler = (_event: unknown, progress: RunProgress): void => listener(progress);
        ipcRenderer.on("run:progress", handler);
        return () => ipcRenderer.removeListener("run:progress", handler);
      },
    }),
    settings: Object.freeze({
      getStatus: () => ipcRenderer.invoke("settings:get-status") as Promise<CredentialStatus>,
      save: (input: CredentialInput) =>
        ipcRenderer.invoke("settings:save", input) as Promise<CredentialStatus>,
      clear: () => ipcRenderer.invoke("settings:clear") as Promise<CredentialStatus>,
    }),
    preferences: Object.freeze({
      get: () => ipcRenderer.invoke("preferences:get") as Promise<Preferences>,
      update: (patch: Partial<Preferences>) =>
        ipcRenderer.invoke("preferences:update", patch) as Promise<Preferences>,
      remove: (key: string) => ipcRenderer.invoke("preferences:remove", key) as Promise<Preferences>,
      getSystemTheme: () => ipcRenderer.invoke("preferences:system-theme") as Promise<"light" | "dark">,
      onSystemThemeChange: (listener: (theme: "light" | "dark") => void) => {
        const handler = (_event: unknown, theme: "light" | "dark"): void => listener(theme);
        ipcRenderer.on("preferences:system-theme-changed", handler);
        return () => ipcRenderer.removeListener("preferences:system-theme-changed", handler);
      },
    }),
  }),
);
