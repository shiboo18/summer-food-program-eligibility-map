import {
  AREA_ELIGIBILITY_LAYER_URL,
  ESRI_GEOCODE_SERVICE_URL,
  EsriGeocoder,
  ExcelSpreadsheetReader,
  KyHttpClient,
  PreferencesStore,
  SettingsStore,
  SmartyAddressValidator,
  SmartyCredentialVerifier,
  SpreadsheetValidationService,
  USDA_RURAL_SERVICE_URL,
  UsdaRuralZoneMapChecker,
  UsdaSummerMealBenefitChecker,
  buildEligibilityReport,
  checkStoredCredentials,
  createPassReporters,
  isDeliverable,
  locateRows,
  parseColumnMapping,
  parseCredentialInput,
  saveAcceptedCredentials,
  toSmartyCredentials,
  toResultAnnotation,
  type AddressRow,
  type AddressRowsResult,
  type AreaEligibilityResult,
  type EligibilityChecks,
  type Geocoder,
  type ProgressReporter,
  type ResultAnnotation,
  type RowVerification,
  type RunPhase,
  type RunProgress,
  type RuralResult,
  type RuralZoneChecker,
  type SmartyCredentialsProvider,
  type SpreadsheetReader,
  type SpreadsheetSummary,
  type SpreadsheetWriter,
  type SummerMealBenefitChecker,
  type ValidatedLocation,
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

function createPreferencesStore(): PreferencesStore {
  return new PreferencesStore(join(app.getPath("userData"), "preferences.v1.json"));
}

/** The stored key, or `undefined` when no whole key is stored. */

function createSmartyCredentialsProvider(settings: SettingsStore): SmartyCredentialsProvider {
  return async () => toSmartyCredentials(await settings.getCredentials());
}

/**
 * The services an eligibility run needs. Each gets its own client, carrying that
 * service's base URL and its own retry budget, so a throttled USDA map cannot
 * delay geocoding.
 */
interface EligibilityServices {
  readonly geocoder: Geocoder;
  readonly zone: RuralZoneChecker;
  readonly benefit: SummerMealBenefitChecker;
}

function createEligibilityServices(): EligibilityServices {
  return {
    geocoder: new EsriGeocoder(new KyHttpClient(ESRI_GEOCODE_SERVICE_URL)),
    zone: new UsdaRuralZoneMapChecker(new KyHttpClient(USDA_RURAL_SERVICE_URL)),
    benefit: new UsdaSummerMealBenefitChecker(new KyHttpClient(AREA_ELIGIBILITY_LAYER_URL)),
  };
}

function resolvedSystemTheme(): "light" | "dark" {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function toEligibilityChecks(input: unknown): EligibilityChecks {
  const checks = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return { rural: checks.rural === true, area: checks.area === true };
}

/** A stable key for a mapping, so cached rows are reused only under the same columns. */
/**
 * Return a reporter that forwards a phase's progress to the frame that asked for
 * the run, so the screen's bar fills as the work goes.
 *
 * @param total The rows the phase works through.
 */
function reportProgressTo(event: IpcMainInvokeEvent, phase: RunPhase, total: number): ProgressReporter {
  return (completed: number): void => {
    if (event.sender.isDestroyed()) {
      return;
    }
    const progress: RunProgress = { phase, completed, total };
    event.sender.send("run:progress", progress);
  };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderFrame = event.senderFrame;
  if (senderFrame === null || !isAllowedNavigation(senderFrame.url, rendererUrl)) {
    throw new Error("Request blocked from an untrusted page.");
  }
}

/**
 * Resolve an untrusted file name to a workbook this process opened through the
 * native dialog, so a file path never comes from the renderer.
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

function registerIpcHandlers(settings: SettingsStore, preferences: PreferencesStore): void {
  const reader: SpreadsheetReader & SpreadsheetWriter = new ExcelSpreadsheetReader();
  const storedCredentials = createSmartyCredentialsProvider(settings);
  const validation = new SpreadsheetValidationService(reader, new SmartyAddressValidator(storedCredentials));
  const credentialVerifier = new SmartyCredentialVerifier();
  const eligibility = createEligibilityServices();
  /** Summaries are kept in the main process so the renderer never supplies a file path. */
  const openedSpreadsheets = new Map<string, SpreadsheetSummary>();
  /**
   * Each file's most recent validation, reused by eligibility so a run reads the
   * workbook and asks Smarty once. Its rows are reused only for the same mapping,
   * so remapped columns are read afresh.
   */
  const validations = new Map<
    string,
    {
      readonly mappingKey: string;
      readonly rows: AddressRowsResult;
      readonly locations: ReadonlyMap<number, ValidatedLocation>;
      readonly verifications: ReadonlyMap<number, RowVerification>;
    }
  >();
  /** The most recent per-row result annotations, written to a copy only when the user downloads. */
  const lastAnnotations = new Map<string, { annotations: readonly ResultAnnotation[]; checks: EligibilityChecks }>();
  /** Where each file's results were last exported, so the renderer can reveal it by name, never by path. */
  const exportedPaths = new Map<string, string>();

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
    const { report, locations, verifications, addressRows } = await validation.validate({
      filePath: summary.filePath,
      mapping: columnMapping,
      onProgress: reportProgressTo(event, "verifying", summary.rowCount),
    });
    validations.set(summary.fileName, { mappingKey: JSON.stringify(columnMapping), rows: addressRows, locations, verifications });
    return report;
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
    const validated = validations.get(summary.fileName);
    const { rows, skipped } =
      validated?.mappingKey === JSON.stringify(columnMapping)
        ? validated.rows
        : await reader.readAddressRows(summary.filePath, columnMapping);

    /* Rows Smarty could not verify have no verified location, so they skip the USDA
       checks and are reported as needing verification. */
    const verifications = validated?.verifications ?? new Map<number, RowVerification>();
    const deliverable = (row: AddressRow): boolean => isDeliverable(verifications.get(row.rowNumber)?.status ?? "unverified");
    const verifiedRows = rows.filter(deliverable);
    const unverified = rows.filter((row) => !deliverable(row)).map((row) => row.rowNumber);

    /* Each USDA pass reports under its own phase so the run screen can name the
       running step. Locating shares a slice with the check after it, so the bar
       fills end to end.

       When both checks run they go out concurrently: they hit different hosts, so
       neither exceeds USDA_CHECK_CONCURRENCY, and their combined progress drives
       the second slice. */
    const runConcurrently = selectedChecks.rural && selectedChecks.area;
    let locating: ProgressReporter | undefined;
    let ruralCheck: ProgressReporter | undefined;
    let areaCheck: ProgressReporter | undefined;
    if (runConcurrently) {
      locating = reportProgressTo(event, "rural", summary.rowCount);
      const combined = reportProgressTo(event, "area", summary.rowCount * 2);
      let ruralDone = 0;
      let areaDone = 0;
      ruralCheck = (completed: number): void => {
        ruralDone = completed;
        combined(ruralDone + areaDone);
      };
      areaCheck = (completed: number): void => {
        areaDone = completed;
        combined(ruralDone + areaDone);
      };
    } else if (selectedChecks.rural) {
      [locating, ruralCheck] = createPassReporters(2, summary.rowCount, reportProgressTo(event, "rural", summary.rowCount));
    } else if (selectedChecks.area) {
      [locating, areaCheck] = createPassReporters(2, summary.rowCount, reportProgressTo(event, "area", summary.rowCount));
    }

    const { located, unlocated } = await locateRows(verifiedRows, eligibility.geocoder, {
      seeds: validated?.locations,
      onProgress: locating,
    });
    const [zone, benefit] = await Promise.all([
      selectedChecks.rural
        ? eligibility.zone.checkZoneBatch(located, ruralCheck)
        : new Map<number, RuralResult | undefined>(),
      selectedChecks.area
        ? eligibility.benefit.checkBenefitBatch(located, areaCheck)
        : new Map<number, AreaEligibilityResult | undefined>(),
    ]);

    const report = buildEligibilityReport({
      located,
      unchecked: [...unlocated, ...unverified, ...skipped],
      zone,
      benefit,
    });
    const annotations = report.rows.map((row) =>
      toResultAnnotation(row.rowNumber, verifications.get(row.rowNumber) ?? { status: "unverified" }, selectedChecks, row),
    );
    // Cache annotations so the user can download them on demand; never write in place.
    lastAnnotations.set(summary.fileName, { annotations, checks: selectedChecks });
    return report;
  });

  ipcMain.handle("results:export", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    if (typeof input !== "object" || input === null) {
      throw new Error("Export request is invalid.");
    }
    const { fileName } = input as { fileName?: unknown };
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);
    const cached = lastAnnotations.get(summary.fileName);
    if (cached === undefined) {
      throw new Error("Run the checks again before downloading results.");
    }

    const suggestedName = summary.fileName.replace(/\.(xlsx|xlsm|xls)$/i, "") + "-results.xlsx";
    const selection = await dialog.showSaveDialog({
      title: "Save results spreadsheet",
      defaultPath: suggestedName,
      filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
    });
    if (selection.canceled || selection.filePath === undefined) {
      return { canceled: true };
    }

    await reader.annotateResults(summary.filePath, cached.annotations, {
      checks: cached.checks,
      outputPath: selection.filePath,
    });
    exportedPaths.set(summary.fileName, selection.filePath);
    return { canceled: false, filePath: selection.filePath };
  });

  /* The exported path is looked up by file name, so it never travels through the
     renderer. */
  ipcMain.handle("results:open", async (event, fileName: unknown): Promise<void> => {
    assertTrustedSender(event);
    const summary = requireOpenedSpreadsheet(openedSpreadsheets, fileName);
    const exportedPath = exportedPaths.get(summary.fileName);
    if (exportedPath === undefined) {
      throw new Error("Export the results before opening them.");
    }
    /* The folder first, so the file can still be found if opening it fails. */
    shell.showItemInFolder(exportedPath);
    if ((await shell.openPath(exportedPath)) !== "") {
      throw new Error("The results file is saved but could not be opened. It is shown in its folder.");
    }
  });

  ipcMain.handle("settings:get-status", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return settings.getStatus();
  });
  ipcMain.handle("settings:save", async (event, input: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    const outcome = await saveAcceptedCredentials(toSmartyCredentials(parseCredentialInput(input)), {
      store: async (credentials) => settings.save(credentials),
      verifier: credentialVerifier,
    });
    return { ...outcome, status: await settings.getStatus() };
  });
  ipcMain.handle("settings:clear", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return settings.clear();
  });
  ipcMain.handle("settings:verify", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return checkStoredCredentials(storedCredentials, credentialVerifier);
  });
  ipcMain.handle("preferences:get", async (event): Promise<unknown> => {
    assertTrustedSender(event);
    return preferences.get();
  });
  ipcMain.handle("preferences:update", async (event, patch: unknown): Promise<unknown> => {
    assertTrustedSender(event);
    return preferences.update(patch);
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
    const preferences = createPreferencesStore();
    registerIpcHandlers(settings, preferences);
    await createWindow();
    app.on("activate", (): void => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().catch(reportFatalError);
      }
    });
  })
  .catch(reportFatalError);
