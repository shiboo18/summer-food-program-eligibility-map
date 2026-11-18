import type {
  ColumnMapping,
  EligibilityChecks,
  EligibilityReport,
  Preferences,
  RunPhase,
  RunProgress,
  ValidationReport,
} from "../../../backend/dist/index.js";
/* Leaf imports of logic and constants only: the backend's barrel would pull its
   Node-only dependencies into the browser context. */
import { RESULT_COLUMNS } from "../../../backend/dist/config/constants.js";
import { resolveAppearance } from "../../../backend/dist/core/appearance.js";
import {
  addressFields,
  cachedColumnMapping,
  followingHeaders,
  preferredHeader,
  type AddressField,
} from "../../../backend/dist/core/address-fields.js";
import { columnLetters } from "../../../backend/dist/core/cell-reference.js";
import { resultColumnsFor } from "../../../backend/dist/core/eligibility-checks.js";
import {
  activeRunPhases,
  runPhaseCopy,
  runPhaseSteps,
  runProgressView,
} from "../../../backend/dist/core/run-progress.js";
import { defaultPreferences } from "../../../backend/dist/types/preferences.js";
import { createField, getRequiredElement, setBusy, showError } from "./dom.js";
import { systemNotifier, type Notifier } from "./notifier.js";
import type { Tone } from "./tone.js";
import { createBackgroundQueue } from "./workflow/background-queue.js";
import { createCloseButton } from "./settings/dialog.js";
import { createSettingsPanel } from "./settings/settings-panel.js";
import { singleFlight } from "./workflow/single-flight.js";
import { resultsLocation } from "./workflow/steps/checks-step.js";
import { workflowSteps } from "./workflow/steps/index.js";
import { headerRowHint } from "./workflow/steps/map-columns-step.js";
import type { WorkflowContext } from "./workflow/workflow-step.js";
import { formatRuntimeSummary } from "../shared/runtime-info.js";
import { friendlyMessage, splitAroundFileName } from "../shared/text.js";
import type { SpreadsheetSelection } from "./runtime-api.js";

const bridge = window.shareOurStrengths;
const notifier: Notifier = systemNotifier;


/* Appearance: apply persisted preferences and keep them live. */
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let systemTheme: "light" | "dark" = "light";
let preferences: Preferences = defaultPreferences;

function applyAppearance(): void {
  const applied = resolveAppearance(preferences.accessibility, systemTheme, motionQuery.matches);
  const root = document.documentElement;
  root.dataset.theme = applied.theme;
  root.dataset.contrast = applied.highContrast ? "high" : "normal";
  root.dataset.motion = applied.reduceMotion ? "reduced" : "full";
}

async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
  preferences = await bridge.preferences.update(patch);
  applyAppearance();
  /* The panel owns the appearance controls, so refreshing it is what re-renders them. */
  settingsPanel.refresh();
}

const preferenceSaves = createBackgroundQueue((error: unknown): void => {
  console.error("Failed to save preferences", error);
});

/**
 * Save preferences without holding up the screen.
 *
 * @param patch Built when the save's turn comes rather than now, so any group it
 *   copies from the current preferences includes the save before it.
 */
function savePreferences(patch: () => Partial<Preferences>): void {
  preferenceSaves.enqueue((): Promise<void> => updatePreferences(patch()));
}

/* Spreadsheet upload and column mapping. */
const introEyebrow = getRequiredElement<HTMLElement>("#intro-eyebrow");
const introTitle = getRequiredElement<HTMLElement>("#intro-title");
const introCopy = getRequiredElement<HTMLElement>("#intro-copy");
const uploadExcelButton = getRequiredElement<HTMLButtonElement>("#upload-excel");
const excelFileStatus = getRequiredElement<HTMLElement>("#excel-file-status");
const excelFileMessage = getRequiredElement<HTMLElement>("#excel-file-message");
const excelFileSpinner = getRequiredElement<HTMLElement>("#excel-file-spinner");
const mappingForm = getRequiredElement<HTMLFormElement>("#mapping-form");
const resultsStats = getRequiredElement<HTMLElement>("#results-stats");
const processingSection = getRequiredElement<HTMLElement>("#processing-section");
const processingBar = getRequiredElement<HTMLElement>("#processing-bar");
const processingBarFill = getRequiredElement<HTMLElement>("#processing-bar-fill");
const processingPercent = getRequiredElement<HTMLElement>("#processing-percent");
const processingCount = getRequiredElement<HTMLElement>("#processing-count");
const processingStatus = getRequiredElement<HTMLElement>("#processing-status");
const processingPrivacy = getRequiredElement<HTMLElement>("#processing-privacy");
const runSteps = getRequiredElement<HTMLOListElement>("#run-steps");
/** The phases this run passes through, set when a run starts so the bar and stepper agree. */
let activeRunPhaseList: readonly RunPhase[] = [];
const appHeader = getRequiredElement<HTMLElement>(".app-header");
const workflowSidebar = getRequiredElement<HTMLElement>(".workflow-sidebar");
const checksSection = getRequiredElement<HTMLElement>("#checks-section");

const checkInputs = {
  rural: getRequiredElement<HTMLInputElement>("#check-rural"),
  area: getRequiredElement<HTMLInputElement>("#check-area"),
};
const runChecksButton = getRequiredElement<HTMLButtonElement>("#run-checks");
const checksMessage = getRequiredElement<HTMLElement>("#checks-message");
const checksResultsLocation = getRequiredElement<HTMLElement>("#checks-results-location");
const mappingHint = getRequiredElement<HTMLElement>("#mapping-hint");

const mappingSelects = Object.fromEntries(
  addressFields.map(({ field }) => {
    const select = document.createElement("select");
    select.id = `map-${field}`;
    return [field, select];
  }),
) as Record<AddressField, HTMLSelectElement>;
mappingHint.after(
  ...addressFields.map(({ field, label, optional }) => createField(mappingSelects[field], label, optional)),
);

type Stage = "upload" | "map-columns" | "checks" | "results";
let stage: Stage = "upload";
let selectedSpreadsheet: SpreadsheetSelection | null = null;
let lastReport: ValidationReport | null = null;
let lastChecks: EligibilityChecks | null = null;

const workflowStepList = getRequiredElement<HTMLOListElement>("#workflow-steps");

function workflowContext(): WorkflowContext {
  return {
    fileName: selectedSpreadsheet?.fileName ?? null,
    report: lastReport,
  };
}

/** Write a step's sub-text, turning any mention of the loaded workbook into a control that reveals it. */
function renderIntroCopy(description: string, fileName: string | null): void {
  const mention = fileName === null ? null : splitAroundFileName(description, fileName);
  if (fileName === null || mention === null) {
    introCopy.textContent = description;
    return;
  }

  const link = document.createElement("a");
  link.className = "text-link";
  link.href = "#";
  link.setAttribute("role", "button");
  link.textContent = fileName;
  link.title = `Show ${fileName} in the file manager`;
  link.addEventListener("click", (event): void => {
    event.preventDefault();
    void bridge.spreadsheet.reveal(fileName).catch((error: unknown): void => {
      notifier.failure(friendlyMessage(error, "That file could not be shown."));
    });
  });

  introCopy.replaceChildren(mention.before, link, mention.after);
}

/** Render the step list, header, and page for the active step. */
function renderWorkflow(): void {
  const context = workflowContext();
  const activeIndex = Math.max(
    workflowSteps.findIndex((step) => step.id === stage),
    0,
  );
  const activeStep = workflowSteps[activeIndex];
  if (activeStep === undefined) {
    throw new Error("Workflow step is unavailable.");
  }

  introEyebrow.textContent = `Step ${activeIndex + 1} of ${workflowSteps.length}`;
  introTitle.textContent = activeStep.title(context);
  renderIntroCopy(activeStep.description(context), context.fileName);

  for (const step of workflowSteps) {
    getRequiredElement<HTMLElement>(`#${step.sectionId}`).hidden = step.id !== activeStep.id;
  }

  const items = workflowSteps.map((step, index) => {
    const available = step.isAvailable(context);
    const item = document.createElement("li");
    item.className = "workflow-step";
    item.dataset.state = step.id === activeStep.id ? "active" : available ? "complete" : "upcoming";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "workflow-step-button";
    button.disabled = !available;
    if (step.id === activeStep.id) {
      button.setAttribute("aria-current", "step");
    }
    button.addEventListener("click", (): void => goToStage(step.id as Stage));

    const number = document.createElement("span");
    number.className = "step-badge";
    number.textContent = String(index + 1);

    const label = document.createElement("span");
    label.className = "workflow-step-label";
    label.textContent = step.label;

    button.append(number, label);
    item.append(button);
    return item;
  });
  workflowStepList.replaceChildren(...items);
}

function goToStage(next: Stage): void {
  const step = workflowSteps.find((candidate) => candidate.id === next);
  if (step === undefined || !step.isAvailable(workflowContext())) {
    return;
  }
  /* Rebuilt from the saved cells each time the screen is shown, so it reflects
     cells edited in the dialog and a file loaded since. */
  if (next === "map-columns" && selectedSpreadsheet !== null) {
    renderMapping(selectedSpreadsheet);
  }
  stage = next;
  renderWorkflow();
  document.querySelector<HTMLElement>(step.focusSelector)?.focus();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** What the workbook status line says, and whether it is still being worked out. */
type FileStatusState = Extract<Tone, "idle" | "pending" | "success" | "error">;

/**
 * Write the workbook status line. The spinner turns while the file is being
 * checked, so the wait reads as work rather than a finished verdict.
 */
function setFileStatus(message: string, state: FileStatusState): void {
  excelFileMessage.textContent = message;
  excelFileStatus.dataset.tone = state;
  excelFileSpinner.hidden = state !== "pending";
}

function fillMappingSelect(
  select: HTMLSelectElement,
  headers: readonly string[],
  optional: boolean,
  suggestion: string,
): void {
  select.replaceChildren();
  if (optional) {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "My file doesn't have this";
    select.append(none);
  }
  /* Unnamed columns are kept in `headers` to hold the positions of the ones after
     them; they cannot be chosen, so they are not offered. */
  for (const header of headers.filter((name) => name.length > 0)) {
    const option = document.createElement("option");
    option.value = header;
    option.textContent = header;
    select.append(option);
  }
  select.value = suggestion;
}

/** Fill the selects from the saved cells, guessing only where nothing is saved. */
function renderMapping(selection: SpreadsheetSelection): void {
  const headers = selection.headers;
  mappingHint.textContent = headerRowHint(selection.headerRowNumber);
  for (const { field, optional, candidates } of addressFields) {
    const preferred = preferredHeader(preferences.columnMapping[field], headers, candidates);
    fillMappingSelect(mappingSelects[field], headers, optional, preferred);
  }
}

async function openSpreadsheet(): Promise<void> {
  setBusy(uploadExcelButton, true, "Checking file");
  setFileStatus("Checking the file opens as an Excel workbook…", "pending");

  const selection = bridge.spreadsheet.open();
  try {
    const [result] = await Promise.all([selection, wait(1_500)]);
    if (result === null) {
      setFileStatus("No file selected.", "idle");
      return;
    }

    selectedSpreadsheet = result;
    lastReport = null;
    setFileStatus("Checked — this is a readable Excel workbook.", "success");
    goToStage("map-columns");
  } catch (error: unknown) {
    selectedSpreadsheet = null;
    lastReport = null;
    goToStage("upload");
    setFileStatus("", "idle");
    notifier.failure(friendlyMessage(error, "That file could not be opened. Try a different Excel file."));
  } finally {
    setBusy(uploadExcelButton, false, "Upload Excel file");
  }
}

uploadExcelButton.addEventListener("click", (): void => {
  void openSpreadsheet();
});

/* Batch validation. */
function currentMapping(): ColumnMapping {
  const line2 = mappingSelects.line2.value;
  const mapping = {
    line1: mappingSelects.line1.value,
    city: mappingSelects.city.value,
    state: mappingSelects.state.value,
    postalCode: mappingSelects.postalCode.value,
  };
  return line2 ? { ...mapping, line2 } : mapping;
}

/**
 * Move on from the mapping screen, saving the chosen columns in the background so
 * the next screen opens without waiting on the store. The run takes its mapping
 * from the selects, not the saved cells.
 */
function finishMapColumns(): void {
  if (selectedSpreadsheet === null) {
    return;
  }
  const chosen = currentMapping();
  const { headers, headerRowNumber } = selectedSpreadsheet;
  savePreferences(() => ({ columnMapping: cachedColumnMapping(chosen, headers, headerRowNumber) }));
  goToStage("checks");
}

mappingForm.addEventListener("submit", (event): void => {
  event.preventDefault();
  finishMapColumns();
});

/*
 * Choosing a column offers the columns after it for the rest of the address.
 * Unlike the Settings cell inputs, these selects always hold a guess, so filled
 * ones are overwritten too; otherwise this would never do anything.
 */
for (const { field } of addressFields) {
  mappingSelects[field].addEventListener("change", (): void => {
    if (selectedSpreadsheet === null) {
      return;
    }
    const chosen = Object.fromEntries(
      addressFields.map(({ field: each }) => [each, mappingSelects[each].value]),
    ) as Record<AddressField, string>;

    for (const [after, header] of Object.entries(
      followingHeaders(field, chosen, selectedSpreadsheet.headers),
    )) {
      mappingSelects[after as AddressField].value = header;
    }
  });
}

/* USDA eligibility checks. The address check always runs, so only these two vary. */
function currentChecks(): EligibilityChecks {
  return { rural: checkInputs.rural.checked, area: checkInputs.area.checked };
}

function showResultsLocation(): void {
  checksResultsLocation.textContent = resultsLocation(resultColumnsFor(currentChecks()));
}

for (const input of [checkInputs.rural, checkInputs.area]) {
  input.addEventListener("change", showResultsLocation);
}

function applyCheckDefaults(): void {
  checkInputs.rural.checked = preferences.checkSelection.rural;
  checkInputs.area.checked = preferences.checkSelection.area;
  showResultsLocation();
}

/**
 * Freeze the header and the step rail while a run is in flight, so the run cannot
 * be left or reconfigured. The processing card stays live so its progress keeps
 * announcing.
 */
function setUiFrozen(frozen: boolean): void {
  appHeader.toggleAttribute("inert", frozen);
  workflowSidebar.toggleAttribute("inert", frozen);
}

function renderCombinedResults(validation: ValidationReport, eligibility: EligibilityReport): void {
  resetExportButton();
  const deliverableCount = validation.verified + validation.corrected;

  const stats = [
    { value: eligibility.total, label: "Rows checked", tone: "neutral" },
    { value: deliverableCount, label: "Deliverable", tone: "good" },
    { value: eligibility.ruralCount, label: "Rural designation", tone: "neutral" },
    { value: eligibility.areaEligibleCount, label: "Area eligible", tone: "neutral" },
  ];
  resultsStats.replaceChildren();
  for (const stat of stats) {
    const tile = document.createElement("div");
    tile.className = "results-stat";
    tile.dataset.tone = stat.tone;
    const value = document.createElement("span");
    value.className = "results-stat-value";
    value.textContent = String(stat.value);
    const label = document.createElement("span");
    label.className = "overline";
    label.textContent = stat.label;
    tile.append(value, label);
    resultsStats.append(tile);
  }
}

/** Fill the stepper, marking each phase done, running, or still to come. */
function renderRunSteps(current: RunPhase): void {
  runSteps.replaceChildren(
    ...runPhaseSteps(activeRunPhaseList, current).map((step): HTMLLIElement => {
      const item = document.createElement("li");
      item.className = "run-step";
      item.dataset.state = step.state;
      item.textContent = step.label;
      return item;
    }),
  );
}

/** Show the card's copy for the running step, so it names one step at a time. */
function showRunPhase(phase: RunPhase): void {
  const copy = runPhaseCopy[phase];
  processingStatus.textContent = copy.detail;
  processingPrivacy.textContent = copy.privacy;
  renderRunSteps(phase);
}

function showRunProgress(progress: RunProgress): void {
  const view = runProgressView(progress, activeRunPhaseList);
  showRunPhase(progress.phase);

  /* A phase with no rows counted has no position to show: Smarty answers a whole
     batch in one request, so verification reports nothing until it is done. Keep
     the bar animating and drop the value a screen reader would read as precise. */
  const counting = progress.completed > 0;
  processingBar.dataset.state = counting ? "determinate" : "indeterminate";
  if (counting) {
    processingBarFill.style.width = `${String(view.percent)}%`;
    processingBar.setAttribute("aria-valuenow", String(view.percent));
  } else {
    processingBarFill.style.removeProperty("width");
    processingBar.removeAttribute("aria-valuenow");
  }
  processingBar.setAttribute("aria-valuetext", view.label);
  processingPercent.textContent = view.readout;
  processingCount.textContent = view.label;
}

/* A report can still be in flight when a run lands or fails, so reports are only
   taken while the card is up — one arriving late cannot undo the next run's reset. */
bridge.run.onProgress((progress: RunProgress): void => {
  if (!processingSection.hidden) {
    showRunProgress(progress);
  }
});

async function performChecks(): Promise<void> {
  if (selectedSpreadsheet === null) {
    return;
  }
  const checks = currentChecks();

  const { blocker } = settingsPanel.credentialView();
  if (blocker !== undefined) {
    notifier.failure(blocker);
    showSettings(true);
    settingsPanel.openCredentials();
    return;
  }

  /* Saved behind the run rather than before it, so the store is never what the
     partner waits on. */
  savePreferences(() => ({ checkSelection: checks }));

  setBusy(runChecksButton, true, "Running checks");
  checksMessage.textContent = "";
  lastChecks = checks;
  activeRunPhaseList = activeRunPhases(lastChecks);
  showRunProgress({ phase: "verifying", completed: 0, total: selectedSpreadsheet.rowCount });
  checksSection.hidden = true;
  processingSection.hidden = false;
  setUiFrozen(true);
  try {
    const mapping = currentMapping();
    const validation = await bridge.spreadsheet.validate(selectedSpreadsheet.fileName, mapping);
    /* Advance as soon as verification lands, not when the next phase first reports,
       so re-reading the sheet is not credited to verification. */
    const firstUsdaPhase = activeRunPhaseList[1];
    if (firstUsdaPhase !== undefined) {
      showRunProgress({ phase: firstUsdaPhase, completed: 0, total: selectedSpreadsheet.rowCount });
    }
    const eligibility = await bridge.eligibility.check(selectedSpreadsheet.fileName, mapping, checks);
    lastReport = validation;
    renderCombinedResults(validation, eligibility);
    processingSection.hidden = true;
    goToStage("results");
  } catch (error: unknown) {
    processingSection.hidden = true;
    checksSection.hidden = false;
    showError(checksMessage, error, "The checks failed.");
  } finally {
    setUiFrozen(false);
    setBusy(runChecksButton, false, "Run checks");
  }
}

/*
 * The run button disables itself during a run, but the step rail can reach "Next:
 * choose checks" again meanwhile, which would start a second run.
 */
const runChecks = singleFlight(performChecks);

runChecksButton.addEventListener("click", (): void => {
  void runChecks();
});

getRequiredElement<HTMLButtonElement>("#start-over").addEventListener("click", (): void => {
  selectedSpreadsheet = null;
  lastReport = null;
  setFileStatus("", "idle");
  goToStage("upload");
});

const downloadResultsButton = getRequiredElement<HTMLButtonElement>("#download-results");
const downloadMessage = getRequiredElement<HTMLElement>("#download-message");

/** After a successful export the primary button reveals the file rather than re-exporting. */
let resultsExported = false;

function exportButtonLabel(): string {
  return resultsExported ? "Open exported file" : "Export results (Excel)";
}

/** Return the button to its pre-export state; called each time results are shown. */
function resetExportButton(): void {
  resultsExported = false;
  setBusy(downloadResultsButton, false, exportButtonLabel());
  downloadMessage.textContent = "";
}

function renderExportMessage(filePath: string): void {
  const originalCount = selectedSpreadsheet?.headers.length ?? 0;
  const added = resultColumnsFor(lastChecks ?? { rural: false, area: false });

  const lead = document.createElement("p");
  lead.textContent = `Saved a copy to ${filePath}. Your original file is unchanged. New columns, after your data:`;

  const list = document.createElement("ul");
  list.className = "export-columns";
  added.forEach((column, index) => {
    const item = document.createElement("li");
    const identifier = document.createElement("strong");
    identifier.textContent = `Column ${columnLetters(originalCount + index + 1)}`;
    const detail = column === RESULT_COLUMNS.standardized ? ` — ${column} (corrected rows only)` : ` — ${column}`;
    item.append(identifier, document.createTextNode(detail));
    list.append(item);
  });

  downloadMessage.replaceChildren(lead, list);
}

async function exportResults(): Promise<void> {
  if (selectedSpreadsheet === null || lastReport === null) {
    return;
  }
  setBusy(downloadResultsButton, true, "Saving");
  downloadMessage.textContent = "";
  try {
    const result = await bridge.results.export(selectedSpreadsheet.fileName);
    if (result.canceled || result.filePath === undefined) {
      return;
    }
    resultsExported = true;
    downloadMessage.dataset.tone = "success";
    renderExportMessage(result.filePath);
  } catch (error: unknown) {
    showError(downloadMessage, error, "Could not save the results file.");
  } finally {
    setBusy(downloadResultsButton, false, exportButtonLabel());
  }
}

async function openExportedFile(): Promise<void> {
  if (selectedSpreadsheet === null) {
    return;
  }
  try {
    await bridge.results.open(selectedSpreadsheet.fileName);
  } catch (error: unknown) {
    showError(downloadMessage, error, "Could not open the exported file.");
  }
}

downloadResultsButton.addEventListener("click", (): void => {
  void (resultsExported ? openExportedFile() : exportResults());
});

/* Startup fails before any view is on screen, so only a dialog is certain to be seen. */
function reportStartupError(error: unknown): void {
  notifier.failure(friendlyMessage(error, "Unable to start vibeCheck."));
}

const homeCredentialNotice = getRequiredElement<HTMLElement>("#home-credential-notice");
const homeCredentialNoticeText = getRequiredElement<HTMLElement>("#home-credential-notice-text");
const homeStartButton = getRequiredElement<HTMLButtonElement>("#home-start");

const settingsPanel = createSettingsPanel({
  getPreferences: () => preferences,
  updatePreferences,
  applyCheckDefaults,
  applyColumnDefaults: (): void => {
    if (selectedSpreadsheet !== null) {
      renderMapping(selectedSpreadsheet);
    }
  },
  notifier,
  onCredentialStateChange: ({ blocker, homeNotice, tone }): void => {
    homeCredentialNoticeText.textContent = homeNotice ?? "";
    homeCredentialNotice.hidden = homeNotice === undefined;
    homeCredentialNotice.dataset.tone = tone;
    /* Held back until the key can run checks; the notice beside it says why. */
    homeStartButton.disabled = blocker !== undefined;
  },
});

motionQuery.addEventListener("change", applyAppearance);
bridge.preferences.onSystemThemeChange((theme): void => {
  systemTheme = theme;
  applyAppearance();
});

/* Views: home, workflow, and settings. */
const homeView = getRequiredElement<HTMLElement>("#home-view");
const homeSteps = getRequiredElement<HTMLOListElement>("#home-steps");
const appView = getRequiredElement<HTMLElement>("#app-view");
const settingsView = getRequiredElement<HTMLElement>("#settings-view");
const settingsToggle = getRequiredElement<HTMLButtonElement>("#settings-toggle");

type View = "home" | "workflow" | "settings";

function showView(view: View): void {
  homeView.hidden = view !== "home";
  appView.hidden = view !== "workflow";
  settingsView.hidden = view !== "settings";
  settingsToggle.setAttribute("aria-expanded", String(view === "settings"));
}

function showSettings(visible: boolean): void {
  showView(visible ? "settings" : "workflow");
  if (visible) {
    settingsClose.focus();
    return;
  }
  settingsToggle.focus();
}

/** The home page explains the tool using the same step registry the workflow uses. */
function renderHomeSteps(): void {
  const items = workflowSteps.map((step, index) => {
    const item = document.createElement("li");
    item.className = "home-step";

    const number = document.createElement("span");
    number.className = "step-badge";
    number.textContent = String(index + 1);

    const title = document.createElement("h2");
    title.className = "subhead";
    title.textContent = step.label;

    const summary = document.createElement("p");
    summary.className = "copy";
    summary.textContent = step.summary;

    item.append(number, title, summary);
    return item;
  });
  homeSteps.replaceChildren(...items);
}

getRequiredElement<HTMLButtonElement>("#home-link").addEventListener("click", (): void => {
  showView("home");
  homeStartButton.focus();
});

/* Only enabled once the key can run checks, so it goes straight to the upload. */
homeStartButton.addEventListener("click", (): void => {
  showView("workflow");
  uploadExcelButton.focus();
});

getRequiredElement<HTMLAnchorElement>("#home-credential-notice-link").addEventListener("click", (event): void => {
  event.preventDefault();
  showSettings(true);
  settingsPanel.openCredentials();
});

settingsToggle.addEventListener("click", (): void => showSettings(settingsView.hidden !== false));
const settingsClose = createCloseButton("Close settings");
getRequiredElement<HTMLElement>(".settings-view-head").append(settingsClose);
settingsClose.addEventListener("click", (): void => showSettings(false));

/* Startup. */
async function initialize(): Promise<void> {
  const runtime = bridge.getRuntimeInfo();
  getRequiredElement<HTMLElement>("#runtime-summary").textContent = formatRuntimeSummary(runtime);
  getRequiredElement<HTMLElement>("#platform").textContent = runtime.platform;

  const [status, storedPreferences, resolvedSystemTheme] = await Promise.all([
    bridge.settings.getStatus(),
    bridge.preferences.get(),
    bridge.preferences.getSystemTheme(),
  ]);
  settingsPanel.showStoredCredentials(status);
  preferences = storedPreferences;
  systemTheme = resolvedSystemTheme;
  applyAppearance();
  settingsPanel.refresh();
  renderWorkflow();
  renderHomeSteps();
  applyCheckDefaults();
  showView("home");
  /* Not awaited: the home page is usable while Smarty answers. */
  void settingsPanel.checkCredentials();
}

void initialize().catch(reportStartupError);
