/* Public surface of the backend. The renderer and preload import types from here
   only, so names must stay stable even as the layout underneath changes. */

export * from "./contracts.js";
export * from "./types/index.js";

/* Adapters, grouped by the system they talk to. */
export {
  SettingsStore,
  type CredentialInput,
  type CredentialStatus,
} from "./services/local/settings-store.js";
export { AppPreferenceStore as PreferencesStore } from "./services/local/preferences-store.js";
export { ExcelSpreadsheetReader } from "./services/local/excel-spreadsheet-reader.js";
export { SmartyAddressValidator } from "./services/smarty/smarty-address-validator.js";

export { PreferencesService } from "./core/preferences-service.js";
export { SpreadsheetValidationService } from "./core/spreadsheet-validation-service.js";
export { parseColumnMapping } from "./core/parse-column-mapping.js";

export type {
  AppAccessibilitySettings,
  AppPreferences as Preferences,
} from "./types/preferences.js";

export { RESULT_COLUMNS } from "./config/constants.js";
