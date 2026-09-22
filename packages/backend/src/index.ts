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

/* USDA eligibility. */
export { FetchJsonHttpClient } from "./services/http/fetch-json-http-client.js";
export { EsriGeocoder } from "./services/geocoding/esri-geocoder.js";
export { FallbackGeocoder } from "./services/geocoding/fallback-geocoder.js";
export { UsdaRuralChecker } from "./services/usda/rural-checker.js";
export { UsdaAreaEligibilityChecker } from "./services/usda/area-eligibility-checker.js";
export { EligibilityRunner } from "./core/eligibility-runner.js";
export { toResultAnnotations } from "./core/result-annotation.js";
