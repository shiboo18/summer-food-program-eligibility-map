import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The Smarty secrets this store holds. Every credential loop walks this list. */
const smartyCredentials = ["smartyAuthId", "smartyAuthToken"] as const;
type SmartyCredential = (typeof smartyCredentials)[number];
export type CredentialInput = Readonly<Partial<Record<SmartyCredential, string>>>;
export type CredentialStatus = Readonly<Record<SmartyCredential, boolean>>;

export interface SecretProtector {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Uint8Array;
  decryptString(value: Uint8Array): string;
}

interface StoredSettings {
  readonly version: 1;
  readonly credentials: Partial<Record<SmartyCredential, string>>;
}

const emptySettings = (): StoredSettings => ({ version: 1, credentials: {} });

export class SettingsStore {
  public constructor(
    private readonly filePath: string,
    private readonly protector: SecretProtector,
  ) {}

  public async getStatus(): Promise<CredentialStatus> {
    const { credentials } = await this.read();
    return {
      smartyAuthId: this.decrypt(credentials.smartyAuthId) !== undefined,
      smartyAuthToken: this.decrypt(credentials.smartyAuthToken) !== undefined,
    };
  }

  public async save(value: unknown): Promise<CredentialStatus> {
    if (!this.protector.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is unavailable on this device.");
    }

    const input = parseCredentialInput(value);
    const settings = await this.read();
    let changed = false;
    for (const name of smartyCredentials) {
      const credential = input[name]?.trim();
      if (credential === undefined || credential.length === 0) {
        continue;
      }
      if (credential.length > 4096) {
        throw new Error("A credential exceeds the supported length.");
      }
      settings.credentials[name] = Buffer.from(this.protector.encryptString(credential)).toString("base64");
      changed = true;
    }

    if (!changed) {
      throw new Error("Enter at least one credential to save.");
    }

    await this.write(settings);
    return this.getStatus();
  }

  public async getCredentials(): Promise<CredentialInput> {
    const { credentials } = await this.read();
    const decrypted: Partial<Record<SmartyCredential, string>> = {};
    for (const name of smartyCredentials) {
      const value = this.decrypt(credentials[name]);
      if (value !== undefined) {
        decrypted[name] = value;
      }
    }
    return decrypted;
  }

  /**
   * Stored credentials become unreadable if the operating-system key changes,
   * for example when the application name changes. Treat them as absent so the
   * user is asked to enter them again instead of hitting a decryption failure.
   */
  private decrypt(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    try {
      return this.protector.decryptString(Buffer.from(value, "base64"));
    } catch {
      return undefined;
    }
  }

  public async clear(): Promise<CredentialStatus> {
    await unlink(this.filePath).catch((error: unknown) => {
      if (!isMissingFile(error)) {
        throw error;
      }
    });
    return this.getStatus();
  }

  private async read(): Promise<StoredSettings> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      return parseSettings(parsed);
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return emptySettings();
      }
      throw error;
    }
  }

  private async write(settings: StoredSettings): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // mkdir ignores the mode for an existing directory, so restrict it explicitly.
    // The file mode below is the real protection, so a directory that cannot be
    // restricted (for example a shared parent) must not block saving.
    await chmod(directory, 0o700).catch(() => undefined);

    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
      // writeFile's mode is masked by umask, so set owner-only access explicitly.
      // Windows has no POSIX modes (access is governed by ACLs on a per-user
      // directory), so a failure here must not block saving.
      await chmod(temporaryPath, 0o600).catch(() => undefined);
      await replaceFile(temporaryPath, this.filePath);
    } catch (error: unknown) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}

function parseCredentialInput(value: unknown): CredentialInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("Credential settings are invalid.");
  }

  const source = value as Record<string, unknown>;
  const input: Partial<Record<SmartyCredential, string>> = {};
  for (const name of smartyCredentials) {
    const credential = source[name];
    if (credential !== undefined && typeof credential !== "string") {
      throw new Error("Credential settings are invalid.");
    }
    if (typeof credential === "string") {
      input[name] = credential;
    }
  }
  return input;
}

function parseSettings(value: unknown): StoredSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("Stored settings are invalid.");
  }

  const record = value as Record<string, unknown>;
  const storedCredentials = record.credentials;
  if (record.version !== 1 || typeof storedCredentials !== "object" || storedCredentials === null) {
    throw new Error("Stored settings are invalid.");
  }

  const source = storedCredentials as Record<string, unknown>;
  const credentials: Partial<Record<SmartyCredential, string>> = {};
  for (const name of smartyCredentials) {
    if (typeof source[name] === "string") {
      credentials[name] = source[name];
    }
  }
  return { version: 1, credentials };
}

async function replaceFile(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (attempt >= 2 || !isRetryableFileError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return hasFileErrorCode(error, "ENOENT");
}

function isRetryableFileError(error: unknown): boolean {
  return hasFileErrorCode(error, "EACCES") || hasFileErrorCode(error, "EBUSY") || hasFileErrorCode(error, "EPERM");
}

function hasFileErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
