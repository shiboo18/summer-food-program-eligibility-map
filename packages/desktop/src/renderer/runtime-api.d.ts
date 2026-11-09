import type {
  ColumnMapping,
  CredentialCheck,
  CredentialInput,
  CredentialStatus,
  EligibilityChecks,
  EligibilityReport,
  Preferences,
  RunProgress,
  ValidationReport,
} from "../../../backend/dist/index.js";
import type { RuntimeInfo } from "../shared/runtime-info.js";

export interface SpreadsheetSelection {
  readonly fileName: string;
  /** Positional: `headers[i]` names column `i + 1`, unnamed columns included. */
  readonly headers: readonly string[];
  /** 1-based row the names came from, which need not be the first row. */
  readonly headerRowNumber: number;
  readonly rowCount: number;
}

/** What saving credentials did. A key Smarty refuses is not stored, so `status` is unchanged. */
export interface CredentialSaveResult {
  readonly saved: boolean;
  /** Smarty's answer about the key the save would leave stored. */
  readonly check: CredentialCheck;
  /** Which halves are stored after the save. */
  readonly status: CredentialStatus;
}

export interface ExportResult {
  readonly canceled: boolean;
  readonly filePath?: string;
  readonly rowsAnnotated?: number;
}

declare global {
  interface Window {
    readonly shareOurStrengths: {
      getRuntimeInfo(): RuntimeInfo;
      readonly spreadsheet: {
        open(): Promise<SpreadsheetSelection | null>;
        /** Reveals the opened workbook in the OS file manager. */
        reveal(fileName: string): Promise<void>;
        validate(fileName: string, mapping: ColumnMapping): Promise<ValidationReport>;
      };
      readonly eligibility: {
        check(fileName: string, mapping: ColumnMapping, checks: EligibilityChecks): Promise<EligibilityReport>;
      };
      readonly results: {
        export(fileName: string): Promise<ExportResult>;
        /** Reveals the exported copy in the OS file manager. */
        reveal(fileName: string): Promise<void>;
      };
      readonly run: {
        /** Subscribes to a run's progress. Returns the unsubscribe function. */
        onProgress(listener: (progress: RunProgress) => void): () => void;
      };
      readonly settings: {
        getStatus(): Promise<CredentialStatus>;
        /** Stores the typed halves unless Smarty refuses the key they would leave stored. */
        save(input: CredentialInput): Promise<CredentialSaveResult>;
        clear(): Promise<CredentialStatus>;
        /** Asks Smarty about the stored key. Resolves `"not-set"` without asking when half or all of it is missing. */
        verify(): Promise<CredentialCheck>;
      };
      readonly preferences: {
        get(): Promise<Preferences>;
        update(patch: Partial<Preferences>): Promise<Preferences>;
        remove(key: keyof Preferences): Promise<Preferences>;
        getSystemTheme(): Promise<"light" | "dark">;
        onSystemThemeChange(listener: (theme: "light" | "dark") => void): () => void;
      };
    };
  }
}

export {};
