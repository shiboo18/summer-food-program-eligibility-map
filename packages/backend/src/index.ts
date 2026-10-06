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
export { UsdaRuralZoneMapChecker } from "./services/usda/usda-rural-zone-map-checker.js";
export { UsdaSummerMealBenefitChecker } from "./services/usda/usda-summer-meal-benefit-checker.js";
export { EsriGeocoder } from "./services/geocoder/esri-geocoder.js";
export { KyHttpClient } from "./services/http/ky-http-client.js";

export { PreferencesService } from "./core/preferences-service.js";
export { SpreadsheetValidationService } from "./core/spreadsheet-validation-service.js";
export { locateRows, type LocateRowsResult, type UnlocatedRow } from "./core/run/locate-rows.js";
export {
  buildEligibilityReport,
  type EligibilityReportInput,
} from "./core/run/eligibility-report.js";
export { createPassReporters } from "./core/run/phase-progress.js";
export { parseColumnMapping } from "./core/parse-column-mapping.js";
export { toResultAnnotation } from "./core/result-annotation.js";

export type {
  AppAccessibilitySettings,
  AppPreferences as Preferences,
  CachedCheckSelection,
} from "./types/preferences.js";

/* Endpoints are exported so the main process, as the composition root, can inject
   each service's base URL into its own client. */
export {
  AREA_ELIGIBILITY_LAYER_URL,
  ESRI_GEOCODE_SERVICE_URL,
  RESULT_COLUMNS,
  USDA_RURAL_SERVICE_URL,
} from "./config/constants.js";
