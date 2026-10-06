import {
  AREA_ELIGIBILITY_LAYER_URL,
  ESRI_GEOCODE_SERVICE_URL,
  EsriGeocoder,
  ExcelSpreadsheetReader,
  KyHttpClient,
  PreferencesService,
  PreferencesStore,
  RESULT_COLUMNS,
  SettingsStore,
  SmartyAddressValidator,
  SpreadsheetValidationService,
  USDA_RURAL_SERVICE_URL,
  UsdaRuralZoneMapChecker,
  UsdaSummerMealBenefitChecker,
  buildEligibilityReport,
  createPassReporters,
  locateRows,
  parseColumnMapping,
  toResultAnnotation,
  type AddressRowsResult,
  type AreaEligibilityResult,
  type CheckOutcome,
  type ColumnMapping,
  type EligibilityChecks,
  type ValidatedLocation,
  type ProgressReporter,
  type ResultAnnotation,
  type RowVerification,
  type RunPhase,
  type RunProgress,
  type RuralResult,
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
 * The services an eligibility run needs. Each gets its own client, carrying that
 * service's base URL and its own retry budget, so a throttled USDA map cannot
 * delay geocoding.
 */
interface EligibilityServices {
  readonly geocoder: EsriGeocoder;
  readonly zone: UsdaRuralZoneMapChecker;
  readonly benefit: UsdaSummerMealBenefitChecker;
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
function columnMappingKey(mapping: ColumnMapping): string {
  return [mapping.line1, mapping.line2 ?? "", mapping.city, mapping.state, mapping.postalCode].join("\u0000");
}

/**
 * A reporter that forwards a phase's progress to the frame that asked for the run,
 * so the screen can fill its bar as the work goes rather than only when it lands.
 *
 * @param total Every data row the sheet holds, which is what both phases work
 *   through, so one bar spans the whole run.
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
  const eligibility = createEligibilityServices();
  /** Summaries are kept in the main process so the renderer never supplies a file path. */
  const openedSpreadsheets = new Map<string, SpreadsheetSummary>();
  /** Smarty coordinates from the most recent validation, reused by eligibility so Smarty is called once. */
  const smartyLocations = new Map<string, ReadonlyMap<number, ValidatedLocation>>();
  /** Per-row Smarty verification (status + standardized address), reused by eligibility for the annotation. */
  const rowVerifications = new Map<string, ReadonlyMap<number, RowVerification>>();
  /** The most recent per-row result annotations, written to a copy only when the user downloads. */
  const lastAnnotations = new Map<string, { annotations: readonly ResultAnnotation[]; checks: EligibilityChecks }>();
  /** Where each file's results were last exported, so the renderer can reveal it by name, never by path. */
  const exportedPaths = new Map<string, string>();
  /** Rows parsed during validation, reused by the eligibility pass so a run reads the
      workbook once. The mapping key guards a re-run under remapped columns from reusing rows read under the old mapping. */
  const parsedRows = new Map<string, { readonly mappingKey: string; readonly rows: AddressRowsResult }>();

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
      fileName: summary.fileName,
      onProgress: reportProgressTo(event, "verifying", summary.rowCount),
    });
    smartyLocations.set(summary.fileName, locations);
    rowVerifications.set(summary.fileName, verifications);
    parsedRows.set(summary.fileName, { mappingKey: columnMappingKey(columnMapping), rows: addressRows });
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
    /* Reuse the rows validation already parsed when the mapping is unchanged, so a
       run reads the workbook once; re-read if the columns were remapped since. */
    const cachedRows = parsedRows.get(summary.fileName);
    const { rows, skipped } =
      cachedRows?.mappingKey === columnMappingKey(columnMapping)
        ? cachedRows.rows
        : await reader.readAddressRows(summary.filePath, columnMapping);

    /* An address Smarty could not verify is not put through the USDA checks — a
       result would have no verified location to stand on — so it is set aside up
       front and reported as needing verification rather than checked. */
    const verifications = rowVerifications.get(summary.fileName) ?? new Map<number, RowVerification>();
    const isDeliverable = (rowNumber: number): boolean => {
      const status = verifications.get(rowNumber)?.status;
      return status === "verified" || status === "corrected";
    };
    const verifiedRows = rows.filter((row) => isDeliverable(row.rowNumber));
    const unverified = rows.filter((row) => !isDeliverable(row.rowNumber)).map((row) => row.rowNumber);

    /* Each USDA pass reports under its own phase so the run screen can name the
       step now running. Locating shares a phase's slice with the check behind it,
       so the bar fills end to end rather than one slice per pass.

       When both checks run they go out concurrently: they hit different hosts, so
       neither sees more than USDA_CHECK_CONCURRENCY at once, and their combined
       progress walks the second slice forward as either pass finishes a row. */
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
      seeds: smartyLocations.get(summary.fileName),
      onProgress: locating,
    });
    const [zone, benefit] = await Promise.all([
      selectedChecks.rural
        ? eligibility.zone.checkZoneBatch(located, ruralCheck)
        : Promise.resolve(new Map<number, CheckOutcome<RuralResult>>()),
      selectedChecks.area
        ? eligibility.benefit.checkBenefitBatch(located, areaCheck)
        : Promise.resolve(new Map<number, CheckOutcome<AreaEligibilityResult>>()),
    ]);

    const report = buildEligibilityReport({
      fileName: summary.fileName,
      located,
      unlocated,
      unverified,
      zone,
      benefit,
      skipped,
      checks: selectedChecks,
    });
    const eligibilityByRow = new Map(report.rows.map((row) => [row.rowNumber, row]));
    const annotations = report.rows.map((row) =>
      toResultAnnotation(
        row.rowNumber,
        verifications.get(row.rowNumber) ?? { status: "unverified" },
        selectedChecks,
        eligibilityByRow.get(row.rowNumber),
      ),
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
      columns: RESULT_COLUMNS,
      includeRural: cached.checks.rural,
      includeArea: cached.checks.area,
      outputPath: selection.filePath,
    });
    exportedPaths.set(summary.fileName, selection.filePath);
    return { canceled: false, filePath: selection.filePath, rowsAnnotated: cached.annotations.length };
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
