import type {
  AppAccessibilitySettings,
  CachedCheckSelection,
  CredentialInput,
  CredentialStatus,
  Preferences,
} from "../../../../backend/dist/index.js";
/* Leaf imports, so loading this panel cannot pull the backend's Node-only
   dependencies into the browser context. */
import { addressFields, type AddressField } from "../../../../backend/dist/core/address-fields.js";
import { followingCells, parseTypedCells } from "../../../../backend/dist/core/cell-mapping.js";
import { getRequiredElement } from "../dom.js";
import { credentialFields, type SmartyCredential } from "./credential-fields.js";
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
}

export interface SettingsPanel {
  /** Re-renders every control from the current preferences. */
  refresh(): void;
  openCredentials(): void;
  showCredentialStatus(status: CredentialStatus): void;
}

/** Long enough for any column letters plus a row, short enough to reject prose. */
const cellInputMaxLength = 10;

const cellLabels = new Map<AddressField, string>(
  addressFields.map(({ field, label }): [AddressField, string] => [field, label]),
);

export function createSettingsPanel(ports: SettingsPanelPorts): SettingsPanel {
  const bridge = window.shareOurStrengths;

  /* Smarty credentials. Secrets live in a modal; Settings shows only a mark. */
  const credentialFieldsContainer = getRequiredElement<HTMLElement>("#credential-fields");
  const credentialStatusMark = getRequiredElement<HTMLElement>("#credential-status");
  const openCredentialsButton = getRequiredElement<HTMLButtonElement>("#open-credentials");
  const settingsForm = getRequiredElement<HTMLFormElement>("#settings-form");
  const settingsMessage = getRequiredElement<HTMLElement>("#settings-message");
  const credentialInputs = new Map<SmartyCredential, HTMLInputElement>();
  const credentialStatusElements = new Map<SmartyCredential, HTMLElement>();

  for (const { name, label } of credentialFields) {
    const caption = document.createElement("label");
    caption.className = "credential-label";
    caption.htmlFor = `credential-${name}`;
    const text = document.createElement("span");
    text.textContent = label;
    const status = document.createElement("strong");
    status.textContent = "Not configured";
    caption.append(text, status);

    const input = document.createElement("input");
    input.id = `credential-${name}`;
    input.name = name;
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;

    credentialFieldsContainer.append(caption, input);
    credentialInputs.set(name, input);
    credentialStatusElements.set(name, status);
  }

  const credentialDialog = createDialog("#credential-overlay", openCredentialsButton, {
    closeLabel: "Close credentials",
    onOpen: (): void => {
      settingsMessage.textContent = "";
      settingsMessage.dataset.state = "idle";
      credentialInputs.get(credentialFields[0]?.name ?? "smartyAuthId")?.focus();
    },
  });

  function errorMessage(error: unknown, fallback = "Unable to update settings."): string {
    return error instanceof Error ? error.message : fallback;
  }

  /** Reports onto the message element of the dialog the failing control lives in. */
  function reportOn(surface: HTMLElement, fallback?: string): (error: unknown) => void {
    return (error: unknown): void => {
      surface.textContent = errorMessage(error, fallback);
      surface.dataset.state = "error";
    };
  }

  /** For controls with no message element of their own; a silent failure is worse. */
  function reportError(error: unknown): void {
    window.alert(errorMessage(error));
  }

  function showCredentialStatus(status: CredentialStatus): void {
    for (const { name } of credentialFields) {
      const configured = status[name];
      const element = credentialStatusElements.get(name);
      if (element !== undefined) {
        element.textContent = configured ? "Configured" : "Not configured";
        element.dataset.configured = String(configured);
      }
      /* Stored secrets are never read back, so a placeholder stands in for them. */
      const input = credentialInputs.get(name);
      if (input !== undefined) {
        input.placeholder = configured ? "xxxxx" : "";
      }
    }

    const missing = credentialFields.filter(({ name }) => !status[name]);
    const configured = missing.length === 0;
    if (configured) {
      /* A bare glyph means nothing to a screen reader, so it carries a label. */
      credentialStatusMark.textContent = "\u2713";
      credentialStatusMark.setAttribute("aria-label", "AUTH_ID and AUTH_TOKEN are configured");
    } else {
      credentialStatusMark.textContent =
        missing.length < credentialFields.length
          ? `${missing.map(({ label }) => label).join(" and ")} missing`
          : "";
      credentialStatusMark.removeAttribute("aria-label");
    }
    credentialStatusMark.dataset.configured = String(configured);
    openCredentialsButton.textContent = configured
      ? "Update Smarty credentials"
      : "Set Smarty credentials";
  }

  settingsForm.addEventListener("submit", (event): void => {
    event.preventDefault();
    /* A blank field keeps whatever is already stored, so only send what was typed. */
    const input: CredentialInput = Object.fromEntries(
      credentialFields
        .map(({ name }): readonly [SmartyCredential, string] => [name, credentialInputs.get(name)?.value ?? ""])
        .filter(([, value]) => value.length > 0),
    );
    void bridge.settings
      .save(input)
      .then((status): void => {
        settingsForm.reset();
        showCredentialStatus(status);
        settingsMessage.textContent = "Credentials saved with operating-system encryption.";
        settingsMessage.dataset.state = "success";
      })
      .catch(reportOn(settingsMessage));
  });

  getRequiredElement<HTMLButtonElement>("#clear-settings").addEventListener("click", (): void => {
    if (!window.confirm("Clear stored Smarty credentials?")) {
      return;
    }
    void bridge.settings
      .clear()
      .then((status): void => {
        showCredentialStatus(status);
        settingsMessage.textContent = "Stored credentials cleared.";
        settingsMessage.dataset.state = "success";
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
    showCredentialStatus,
  };
}
