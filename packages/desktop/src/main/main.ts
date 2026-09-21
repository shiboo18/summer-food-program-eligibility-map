import {
  EligibilityRunner,
  EsriGeocoder,
  ExcelSpreadsheetReader,
  FallbackGeocoder,
  PreferencesService,
  PreferencesStore,
  RESULT_COLUMNS,
  SettingsStore,
  SmartyAddressValidator,
  SpreadsheetValidationService,
  UsdaAreaEligibilityChecker,
  UsdaRuralChecker,
  parseColumnMapping,
  type EligibilityChecks,
  type ProgressReporter,
  type ResultAnnotation,
  type RowVerification,
  type RunProgress,
  type GeocodeResult,
  type SpreadsheetSummary,
} from "../../../backend/dist/index.js";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isAllowedExternalLink, isAllowedNavigation } from "./navigation.js";
import { denyAllPermissions } from "./permissions.js";
import { createWindowOptions } from "./window-options.js";

const isSmokeTest = process.argv.includes("--smoke-test");
const preloadPath = fileURLToPath(new URL("../preload/preload.cjs", import.meta.url));
const rendererPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const iconPath = fileURLToPath(new URL("../renderer/assets/vibecheck-icon.png", import.meta.url));
const rendererUrl = pathToFileURL(rendererPath).toString();

app.setName("vibeCheck");

function createSettingsStore(): SettingsStore {
  return new SettingsStore(join(app.getPath("userData"), "credentials.v1.json"), {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (value) => safeStorage.decryptString(Buffer.from(value)),
  });
}

function createPreferencesService(): PreferencesService {
  return new PreferencesService(new PreferencesStore(join(app.getPath("userData"), "preferences.v1.json")));
}

type SmartyCredentialsProvider = () => Promise<{ authId: string | undefined; authToken: string | undefined }>;

function createSmartyCredentialsProvider(settings: SettingsStore): SmartyCredentialsProvider {
  return async () => {
    const credentials = await settings.getCredentials();
    return {
      authId: credentials.smartyAuthId,
      authToken: credentials.smartyAuthToken,
    };
  };
}

function createSmartyAddressValidator(settings: SettingsStore): SmartyAddressValidator {
  return new SmartyAddressValidator(createSmartyCredentialsProvider(settings));
}

/**
 * The eligibility geocoder. Smarty coordinates are reused from the validation
 * step (seeded per row), so the eligibility pipeline only needs the free Esri
 * World Geocoder as a fallback for rows Smarty could not locate.
 */
function createEligibilityRunner(): EligibilityRunner {
  const geocoder = new FallbackGeocoder([new EsriGeocoder()]);
  return new EligibilityRunner(geocoder, new UsdaRuralChecker(), new UsdaAreaEligibilityChecker());
}

function resolvedSystemTheme(): "light" | "dark" {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

/** One deliverability annotation per verified row, keyed by row number, in order. */
function toAnnotations(verifications: ReadonlyMap<number, RowVerification>): readonly ResultAnnotation[] {
  return [...verifications.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, verification]): ResultAnnotation => {
      if (verification.status === "corrected") {
        return {
          rowNumber,
          deliverability: "Valid and corrected",
          ...(verification.standardizedAddress === undefined
            ? {}
            : { standardizedAddress: verification.standardizedAddress }),
        };
      }
      return {
        rowNumber,
        deliverability: verification.status === "verified" ? "Valid" : "Invalid",
      };
    });
}

/**
 * A reporter that forwards validation progress to the frame that asked for the
 * run, so the screen can fill its bar as the work goes rather than only when it
 * lands.
 *
 * @param total Every data row the sheet holds, so one bar spans the whole run.
 */
function reportProgressTo(event: IpcMainInvokeEvent, total: number): ProgressReporter {
  return (completed: number): void => {
    if (event.sender.isDestroyed()) {
      return;
    }
    const progress: RunProgress = { completed, total };
    event.sender.send("run:progress", progress);
  };
}

/** Reads which USDA checks the user ticked; anything unrecognised is treated as unticked. */
function toEligibilityChecks(input: unknown): EligibilityChecks {
  const checks = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return { rural: checks.rural === true, area: checks.area === true };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderFrame = event.senderFrame;
  if (senderFrame === null || !isAllowedNavigation(senderFrame.url, rendererUrl)) {
    throw new Error("Request blocked from an untrusted page.");
  }
}

/**
 * Resolves an untrusted file name to a workbook this process opened through the
 * native dialog, so a file path can never come from the renderer.
 */
function requireOpenedSpreadsheet(
  opened: Map<string, SpreadsheetSummary>,
  fileName: unknown,
): SpreadsheetSummary {
  if (typeof fileName !== "string") {
    throw new Error("Upload an Excel file first.");
  }
  const summary = opened.get(fileName);
  if (summary === undefined) {
    throw new Error("Upload the Excel file again before continuing.");
  }
  return summary;
}

function registerIpcHandlers(settings: SettingsStore, preferences: PreferencesService): void {
  const reader = new ExcelSpreadsheetReader();
  const validation = new SpreadsheetValidationService(reader, createSmartyAddressValidator(settings));
  const eligibility = createEligibilityRunner();
  /** Summaries are kept in the main process so the renderer never supplies a file path. */
  const openedSpreadsheets = new Map<string, SpreadsheetSummary>();
  /** Per-row Smarty verification (status + standardized address) from the most recent run, used for the export. */
  const rowVerifications = new Map<string, ReadonlyMap<number, RowVerification>>();
  /** Where each file's results were last exported, so the renderer can reveal it by name, never by path. */
  const exportedPaths = new Map<string, string>();
  /** Smarty coordinates from the most recent validation, reused by eligibility so Smarty is called once. */
  const smartyGeocodes = new Map<string, ReadonlyMap<number, GeocodeResult>>();

  ipcMain.handle("spreadsheet:open", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    const selection = await dialog.showOpenDialog({
      title: "Choose an Excel file",
      properties: ["openFile"],
      filters: [{ name: "Excel workbook", extensions: ["xlsx", "xlsm", "xls"] }],
    });
    const filePath = selection.filePaths[0];
    if (selection.canceled || filePath === undefined) {
      return null;
    }

    const summary = await reader.readSummary(filePath);
    openedSpreadsheets.set(summary.fileName, summary);
    return {
      fileName: summary.fileName,
      headers: summary.headers,
      headerRowNumber: summary.headerRowNumber,
      rowCount: summary.rowCount,
    };
  });

  /* Shows the workbook in the OS file manager rather than opening it, so nothing
     can hold a lock on the file a run is reading. */
  ipcMain.handle("spreadsheet:reveal", (event, fileName: unknown): void => {
    assertTrustedSender(event);
    shell.showItemInFolder(requireOpenedSpreadsheet(openedSpreadsheets, fileName).filePath);
  });

  ipcMain.handle("spreadsheet:validate", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    if (typeof input !== "object" || input === null) {
      throw new Error("Validation request is invalid.");
    }

    const { fileName, mapping } = input as { fileName?: unknown; mapping?: unknown };
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);

    const columnMapping = parseColumnMapping(mapping, summary.headers);
    const { report, verifications, geocodes } = await validation.validate({
      filePath: summary.filePath,
      mapping: columnMapping,
      fileName: summary.fileName,
      onProgress: reportProgressTo(event, summary.rowCount),
    });
    rowVerifications.set(summary.fileName, verifications);
    smartyGeocodes.set(summary.fileName, geocodes);
    return report;
  });

  ipcMain.handle("results:export", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    if (typeof input !== "object" || input === null) {
      throw new Error("Export request is invalid.");
    }
    const { fileName } = input as { fileName?: unknown };
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);
    const verifications = rowVerifications.get(summary.fileName);
    if (verifications === undefined) {
      throw new Error("Validate the addresses again before downloading results.");
    }
    const annotations = toAnnotations(verifications);

    const suggestedName = summary.fileName.replace(/\.(xlsx|xlsm|xls)$/i, "") + "-results.xlsx";
    const selection = await dialog.showSaveDialog({
      title: "Save results spreadsheet",
      defaultPath: suggestedName,
      filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
    });
    if (selection.canceled || selection.filePath === undefined) {
      return { canceled: true };
    }

    await reader.annotateResults(summary.filePath, annotations, {
      columns: RESULT_COLUMNS,
      outputPath: selection.filePath,
    });
    exportedPaths.set(summary.fileName, selection.filePath);
    return { canceled: false, filePath: selection.filePath, rowsAnnotated: annotations.length };
  });

  /* Reveals the exported copy in the OS file manager. The path is looked up here by
     file name, so it never has to travel through the renderer. */
  ipcMain.handle("results:reveal", (event, fileName: unknown): void => {
    assertTrustedSender(event);
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);
    const exportedPath = exportedPaths.get(summary.fileName);
    if (exportedPath === undefined) {
      throw new Error("Export the results before opening them.");
    }
    shell.showItemInFolder(exportedPath);
  });

  ipcMain.handle("eligibility:check", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    if (typeof input !== "object" || input === null) {
      throw new Error("Eligibility request is invalid.");
    }

    const { fileName, mapping, checks } = input as { fileName?: unknown; mapping?: unknown; checks?: unknown };
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);

    const columnMapping = parseColumnMapping(mapping, summary.headers);
    const selectedChecks = toEligibilityChecks(checks);
    const { rows, skipped } = await reader.readAddressRows(summary.filePath, columnMapping);
    const seedGeocodes = smartyGeocodes.get(summary.fileName);
    return eligibility.run(rows, selectedChecks, summary.fileName, skipped, seedGeocodes);
  });

  ipcMain.handle("settings:get-status", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return settings.getStatus();
  });
  ipcMain.handle("settings:save", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    return settings.save(input);
  });
  ipcMain.handle("settings:clear", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return settings.clear();
  });
  ipcMain.handle("preferences:get", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return preferences.readAll();
  });
  ipcMain.handle("preferences:update", async (event, patch: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    return preferences.write(patch);
  });
  ipcMain.handle("preferences:remove", async (event, key: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    return preferences.remove(key);
  });
  ipcMain.handle("preferences:system-theme", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return resolvedSystemTheme();
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(createWindowOptions(preloadPath, iconPath));

  denyAllPermissions(window.webContents.session);
  window.once("ready-to-show", (): void => {
    if (!isSmokeTest) {
      window.show();
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalLink(url)) {
      void shell.openExternal(url).catch((error: unknown) => {
        console.error("Failed to open approved external link", error);
      });
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl): void => {
    if (!isAllowedNavigation(targetUrl, rendererUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event): void => event.preventDefault());

  const onThemeUpdated = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send("preferences:system-theme-changed", resolvedSystemTheme());
    }
  };
  nativeTheme.on("updated", onThemeUpdated);
  window.on("closed", (): void => {
    nativeTheme.off("updated", onThemeUpdated);
  });

  if (isSmokeTest) {
    const timeout = setTimeout((): void => {
      console.error("Electron smoke test timed out");
      app.exit(1);
    }, 15_000);
    window.webContents.once("did-finish-load", (): void => {
      clearTimeout(timeout);
      console.log("vibeCheck Electron smoke test passed");
      app.quit();
    });
    window.webContents.once("did-fail-load", (_event, code, description, _url, isMainFrame): void => {
      if (isMainFrame) {
        clearTimeout(timeout);
        console.error(`Electron smoke test failed to load: ${code} ${description}`);
        app.exit(1);
      }
    });
  }

  await window.loadFile(rendererPath);
  return window;
}

function reportFatalError(error: unknown): void {
  console.error("vibeCheck failed to start", error);
  if (isSmokeTest) {
    app.exit(1);
  } else {
    app.quit();
  }
}

app.on("window-all-closed", (): void => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void app
  .whenReady()
  .then(async (): Promise<void> => {
    if (app.dock !== undefined) {
      app.dock.setIcon(iconPath);
    }
    const settings = createSettingsStore();
    const preferences = createPreferencesService();
    registerIpcHandlers(settings, preferences);
    await createWindow();
    app.on("activate", (): void => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().catch(reportFatalError);
      }
    });
  })
  .catch(reportFatalError);
