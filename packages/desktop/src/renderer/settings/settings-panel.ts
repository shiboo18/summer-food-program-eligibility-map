import type {
  AppAccessibilitySettings,
  CachedCheckSelection,
  CredentialCheck,
  CredentialStatus,
  Preferences,
  SmartyCredentials,
} from "../../../../backend/dist/index.js";
/* Leaf imports, so loading this panel cannot pull the backend's Node-only
   dependencies into the browser context. */
import { addressFields, type AddressField } from "../../../../backend/dist/core/address-fields.js";
import { followingCells, parseTypedCells } from "../../../../backend/dist/core/cell-mapping.js";
import { toCredentialInput, toSmartyCredentials } from "../../../../backend/dist/core/smarty-credentials.js";
import { SMARTY_API_KEYS_URL } from "../../../../backend/dist/config/constants.js";
import { friendlyMessage } from "../../shared/text.js";
import { getRequiredElement } from "../dom.js";
import { latestOnly } from "../workflow/latest-only.js";
import { singleFlight } from "../workflow/single-flight.js";
import { credentialFields, type SmartyCredential } from "./credential-fields.js";
import {
  credentialStatusView,
  type CredentialDisplayState,
  type CredentialStatusView,
} from "./credential-status-text.js";
import { createDialog } from "./dialog.js";

export interface SettingsPanelPorts {
  getPreferences(): Preferences;
  updatePreferences(patch: Partial<Preferences>): Promise<void>;
  /** Adopts preferences returned by a direct bridge call, such as a delete. */
  adoptPreferences(next: Preferences): void;
  /** Mirrors new check defaults onto the Checks step so both agree. */
  applyCheckDefaults(selection: CachedCheckSelection): void;
  /** Mirrors newly saved header cells onto the Map columns step so both agree. */
  applyColumnDefaults(): void;
  /** Called whenever the stored key's state changes, so other screens can reflect it. */
  onCredentialStateChange(view: CredentialStatusView): void;
}

export interface SettingsPanel {
  /** Re-renders every control from the current preferences. */
  refresh(): void;
  openCredentials(): void;
  /**
   * Shows which halves of the key are stored. Half a key or none reads as not
   * set straight away; a whole key reads as checking until Smarty's verdict on
   * it is shown.
   */
  showStoredCredentials(status: CredentialStatus): void;
  /** Asks Smarty about the stored key in the background; never rejects. */
  checkCredentials(): Promise<void>;
  /** The stored key's state as last shown. */
  credentialView(): CredentialStatusView;
}

/** Long enough for any column letters plus a row, short enough to reject prose. */
const cellInputMaxLength = 10;

const cellLabels = new Map<AddressField, string>(
  addressFields.map(({ field, label }): [AddressField, string] => [field, label]),
);

export function createSettingsPanel(ports: SettingsPanelPorts): SettingsPanel {
  const bridge = window.shareOurStrengths;

  /* Smarty credentials. Secrets live in a modal; Settings shows only Smarty's
     verdict on them, in the group and again inside the modal. */
  const credentialFieldsContainer = getRequiredElement<HTMLElement>("#credential-fields");
  const credentialStatusLines = [
    getRequiredElement<HTMLElement>("#credential-status"),
    getRequiredElement<HTMLElement>("#credential-dialog-status"),
  ];
  const openCredentialsButton = getRequiredElement<HTMLButtonElement>("#open-credentials");
  const settingsForm = getRequiredElement<HTMLFormElement>("#settings-form");
  const settingsMessage = getRequiredElement<HTMLElement>("#settings-message");
  const saveCredentialsButton = getRequiredElement<HTMLButtonElement>("#save-credentials");
  const credentialInputs = new Map<SmartyCredential, HTMLInputElement>();
  /* Opens in the partner's own browser, where they are already signed in. */
  getRequiredElement<HTMLAnchorElement>("#open-smarty-keys").href = SMARTY_API_KEYS_URL;

  for (const { name, label } of credentialFields) {
    const caption = document.createElement("label");
    caption.htmlFor = `credential-${name}`;
    caption.textContent = label;

    const input = document.createElement("input");
    input.id = `credential-${name}`;
    input.name = name;
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;

    credentialFieldsContainer.append(caption, input);
    credentialInputs.set(name, input);
    input.addEventListener("input", updateSaveAvailability);
  }

  function typedCredentials(): SmartyCredentials | undefined {
    return toSmartyCredentials(Object.fromEntries([...credentialInputs].map(([name, input]) => [name, input.value])));
  }

  /* Save stays greyed out until both halves are typed: a save replaces the whole key. */
  function updateSaveAvailability(): void {
    const ready = typedCredentials() !== undefined;
    saveCredentialsButton.disabled = !ready;
    saveCredentialsButton.classList.toggle("is-active", ready);
  }

  /* The form's own reset fires no input events, so availability is redone with it. */
  function resetCredentialForm(): void {
    settingsForm.reset();
    updateSaveAvailability();
  }

  const credentialDialog = createDialog("#credential-overlay", openCredentialsButton, {
    closeLabel: "Close credentials",
    onOpen: (): void => {
      settingsMessage.textContent = "";
      settingsMessage.dataset.state = "idle";
      updateSaveAvailability();
      credentialInputs.get(credentialFields[0]?.name ?? "smartyAuthId")?.focus();
    },
  });

  const settingsFailure = "Unable to update settings.";

  /** Reports onto the message element of the dialog the failing control lives in. */
  function reportOn(surface: HTMLElement, fallback = settingsFailure): (error: unknown) => void {
    return (error: unknown): void => {
      surface.textContent = friendlyMessage(error, fallback);
      surface.dataset.state = "error";
    };
  }

  /** For controls with no message element of their own; a silent failure is worse. */
  function reportError(error: unknown): void {
    window.alert(friendlyMessage(error, settingsFailure));
  }

  let credentialState: CredentialDisplayState = "checking";

  function showCredentialState(state: CredentialDisplayState): void {
    credentialState = state;
    const view = credentialStatusView(state);
    for (const line of credentialStatusLines) {
      line.textContent = view.text;
      line.dataset.tone = view.tone;
      /* Hidden rather than left empty, so it leaves no gap in the dialog. */
      line.hidden = view.text === "";
    }
    ports.onCredentialStateChange(view);
  }

  function showStoredCredentials(status: CredentialStatus): void {
    /* Stored secrets are never read back, so a placeholder stands in for them. */
    for (const { name } of credentialFields) {
      const input = credentialInputs.get(name);
      if (input !== undefined) {
        input.placeholder = status[name] ? "xxxxx" : "";
      }
    }
    const wholeKey = credentialFields.every(({ name }) => status[name]);
    openCredentialsButton.textContent = wholeKey ? "Update Smarty credentials" : "Set Smarty credentials";
    showCredentialState(wholeKey ? "checking" : "not-set");
  }

  /* Every answer about the key goes through here, so a slower answer about a key
     the partner has since replaced or cleared never overwrites the newer one. A
     save or a clear already knows its answer, so it passes it in. */
  const showLatestCheck = latestOnly(
    async (known?: CredentialCheck): Promise<CredentialCheck> => known ?? bridge.settings.verify(),
    showCredentialState,
  );

  async function checkCredentials(): Promise<void> {
    if (credentialState !== "not-set") {
      showCredentialState("checking");
    }
    /* The bridge itself failing says nothing about the key either way. */
    await showLatestCheck().catch((): void => showCredentialState("unreachable"));
  }

  settingsForm.addEventListener("submit", (event): void => {
    event.preventDefault();
    /* Save is disabled until both halves are typed, and a disabled default
       button blocks Enter too, so this only narrows the type. */
    const credentials = typedCredentials();
    if (credentials !== undefined) {
      void saveCredentials(credentials);
    }
  });

  /* Smarty is asked before anything is stored, which can take seconds. Save is
     greyed out meanwhile, and a second press is ignored rather than sending a
     second save and showing a second confirmation. */
  const saveCredentials = singleFlight(async (credentials: SmartyCredentials): Promise<void> => {
    saveCredentialsButton.disabled = true;
    saveCredentialsButton.classList.remove("is-active");
    try {
      const { saved, check, status } = await bridge.settings.save(toCredentialInput(credentials));
      if (!saved) {
        /* Nothing was stored, so the status still describes the key that is.
           The typed values stay in the form so a typo can be fixed. */
        settingsMessage.textContent = credentialStatusView(check).refusedSave ?? "That key wasn't saved.";
        settingsMessage.dataset.state = "error";
        return;
      }
      resetCredentialForm();
      showStoredCredentials(status);
      void showLatestCheck(check);
      credentialDialog.close();
      /* The system's own pop-up, matching the confirm before a clear. */
      window.alert("Credentials saved securely.");
    } catch (error: unknown) {
      reportOn(settingsMessage)(error);
    } finally {
      updateSaveAvailability();
    }
  });

  getRequiredElement<HTMLButtonElement>("#clear-settings").addEventListener("click", (): void => {
    if (!window.confirm("Clear stored Smarty credentials?")) {
      return;
    }
    void bridge.settings
      .clear()
      .then((status): void => {
        resetCredentialForm();
        showStoredCredentials(status);
        void showLatestCheck("not-set");
        credentialDialog.close();
        window.alert("Stored credentials cleared.");
      })
      .catch(reportOn(settingsMessage));
  });

  /* Map Columns. Files are named differently each time, so the user pins the
     header cell for each column rather than a column name. */
  const addressCells = getRequiredElement<HTMLElement>("#default-columns");
  const columnsForm = getRequiredElement<HTMLFormElement>("#column-settings-form");
  const columnsMessage = getRequiredElement<HTMLElement>("#column-settings-message");
  const openColumnsButton = getRequiredElement<HTMLButtonElement>("#open-columns");
  const cellInputs = new Map<AddressField, HTMLInputElement>();
  const requiredCells = new Set<AddressField>();

  createDialog("#columns-overlay", openColumnsButton, {
    closeLabel: "Close map columns",
    onOpen: (): void => {
      columnsMessage.textContent = "";
      columnsMessage.dataset.state = "idle";
    },
  });

  function addCellField(field: AddressField, label: string, optional: boolean): void {
    const wrapper = document.createElement("div");
    wrapper.className = "cell-field";

    const caption = document.createElement("label");
    caption.htmlFor = `cell-${field}`;
    caption.textContent = optional ? `${label} (optional)` : label;

    const input = document.createElement("input");
    input.id = `cell-${field}`;
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "A1";
    input.maxLength = cellInputMaxLength;
    input.value = ports.getPreferences().columnMapping[field] ?? "";

    wrapper.append(caption, input);
    addressCells.append(wrapper);
    cellInputs.set(field, input);
    if (!optional) {
      requiredCells.add(field);
    }
  }

  /** Typing the first cell fills the rest, leaving typed cells alone. */
  function followFirstCell(): void {
    const [first, ...rest] = addressFields.map(({ field }) => field);
    const lead = first === undefined ? undefined : cellInputs.get(first);
    lead?.addEventListener("input", (): void => {
      const cells = followingCells(lead.value, rest.length);
      rest.forEach((field, index) => {
        const input = cellInputs.get(field);
        const cell = cells[index];
        if (input !== undefined && cell !== undefined && input.value.trim().length === 0) {
          input.value = cell;
        }
      });
    });
  }

  function renderCellFields(): void {
    addressCells.replaceChildren();
    cellInputs.clear();
    requiredCells.clear();

    for (const { field, label, optional } of addressFields) {
      addCellField(field, label, optional);
    }

    followFirstCell();

    const mapping = ports.getPreferences().columnMapping;
    const anySet = [...cellInputs.keys()].some((field) => mapping[field] !== undefined);
    openColumnsButton.textContent = anySet ? "Change map columns" : "Set map columns";
  }

  columnsForm.addEventListener("submit", (event): void => {
    event.preventDefault();
    const result = parseTypedCells(
      [...cellInputs].map(([field, input]) => ({
        field,
        label: cellLabels.get(field) ?? field,
        required: requiredCells.has(field),
        value: input.value,
      })),
    );

    if (!result.ok) {
      columnsMessage.textContent = result.message;
      columnsMessage.dataset.state = "error";
      return;
    }

    void ports
      .updatePreferences({ columnMapping: result.cells })
      .then((): void => {
        ports.applyColumnDefaults();
        columnsMessage.textContent = "Header cells saved.";
        columnsMessage.dataset.state = "success";
      })
      .catch(reportOn(columnsMessage, "Unable to save header cells."));
  });

  getRequiredElement<HTMLButtonElement>("#clear-column-mapping").addEventListener("click", (): void => {
    if (!window.confirm("Clear the saved header cells?")) {
      return;
    }
    void bridge.preferences
      .remove("columnMapping")
      .then((stored): void => {
        ports.adoptPreferences(stored);
        renderCellFields();
        ports.applyColumnDefaults();
        columnsMessage.textContent = "Saved cells cleared.";
        columnsMessage.dataset.state = "success";
      })
      .catch(reportOn(columnsMessage));
  });

  /* USDA check defaults, which pre-select the Checks step. */
  const openChecksButton = getRequiredElement<HTMLButtonElement>("#open-checks");
  const preferredChecks = {
    rural: getRequiredElement<HTMLInputElement>("#pref-rural"),
    area: getRequiredElement<HTMLInputElement>("#pref-area"),
  };
  createDialog("#checks-overlay", openChecksButton, { closeLabel: "Close USDA checks" });

  for (const [name, input] of Object.entries(preferredChecks)) {
    input.addEventListener("change", (): void => {
      const next = { ...ports.getPreferences().checkSelection, [name]: input.checked };
      void ports
        .updatePreferences({ checkSelection: next })
        .then((): void => ports.applyCheckDefaults(ports.getPreferences().checkSelection))
        .catch(reportError);
    });
  }

  /* Appearance and accessibility. */
  const themeSelect = getRequiredElement<HTMLSelectElement>("#theme-select");
  const highContrast = getRequiredElement<HTMLInputElement>("#high-contrast");
  const reduceMotion = getRequiredElement<HTMLInputElement>("#reduce-motion");
  createDialog("#appearance-overlay", getRequiredElement<HTMLButtonElement>("#open-appearance"), {
    closeLabel: "Close appearance",
  });

  /** The group is stored whole, so an unchanged setting is sent along with the changed one. */
  function changeAccessibility(change: Partial<AppAccessibilitySettings>): void {
    const accessibility = { ...ports.getPreferences().accessibility, ...change };
    void ports.updatePreferences({ accessibility }).catch(reportError);
  }

  themeSelect.addEventListener("change", (): void => {
    changeAccessibility({ theme: themeSelect.value as AppAccessibilitySettings["theme"] });
  });
  highContrast.addEventListener("change", (): void => {
    changeAccessibility({ highContrast: highContrast.checked });
  });
  reduceMotion.addEventListener("change", (): void => {
    changeAccessibility({ reduceMotion: reduceMotion.checked });
  });

  return {
    refresh(): void {
      const current = ports.getPreferences();
      themeSelect.value = current.accessibility.theme;
      highContrast.checked = current.accessibility.highContrast;
      reduceMotion.checked = current.accessibility.reduceMotion;
      preferredChecks.rural.checked = current.checkSelection.rural;
      preferredChecks.area.checked = current.checkSelection.area;
      renderCellFields();
    },
    openCredentials(): void {
      credentialDialog.open();
    },
    showStoredCredentials,
    checkCredentials,
    credentialView: (): CredentialStatusView => credentialStatusView(credentialState),
  };
}
