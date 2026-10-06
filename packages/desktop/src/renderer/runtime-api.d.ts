import type {
  ColumnMapping,
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
        save(input: CredentialInput): Promise<CredentialStatus>;
        clear(): Promise<CredentialStatus>;
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
