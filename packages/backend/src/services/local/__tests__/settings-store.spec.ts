import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import { SettingsStore, type SecretProtector } from "../settings-store.js";

const directories: string[] = [];
const protector: SecretProtector = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
  decryptString: (value) => Buffer.from(value).toString("utf8").replace(/^protected:/, ""),
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("SettingsStore", () => {
  test("stores encrypted Smarty credentials without returning secrets in status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "share-our-strengths-"));
    directories.push(directory);
    const filePath = join(directory, "settings.json");
    const store = new SettingsStore(filePath, protector);

    const status = await store.save({ smartyAuthId: "auth-id", smartyAuthToken: "top-secret" });

    expect(status).toEqual({ smartyAuthId: true, smartyAuthToken: true });
    const contents = await readFile(filePath, "utf8");
    expect(contents).not.toContain("auth-id");
    expect(contents).not.toContain("top-secret");
    expect(await store.getCredentials()).toEqual({
      smartyAuthId: "auth-id",
      smartyAuthToken: "top-secret",
    });
  });

  test("clears all stored credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "share-our-strengths-"));
    directories.push(directory);
    const store = new SettingsStore(join(directory, "settings.json"), protector);
    await store.save({ smartyAuthId: "auth-id" });

    await expect(store.clear()).resolves.toEqual({ smartyAuthId: false, smartyAuthToken: false });
  });

  test("reports credentials as not configured when they can no longer be decrypted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "share-our-strengths-"));
    directories.push(directory);
    const filePath = join(directory, "settings.json");
    await new SettingsStore(filePath, protector).save({
      smartyAuthId: "auth-id",
      smartyAuthToken: "top-secret",
    });

    // A changed operating-system key makes existing ciphertext unreadable.
    const rotatedKey: SecretProtector = {
      ...protector,
      decryptString: () => {
        throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
      },
    };
    const store = new SettingsStore(filePath, rotatedKey);

    await expect(store.getStatus()).resolves.toEqual({ smartyAuthId: false, smartyAuthToken: false });
    await expect(store.getCredentials()).resolves.toEqual({});
  });

  test("restricts the credential file and directory to the owner", async () => {
    const parent = await mkdtemp(join(tmpdir(), "share-our-strengths-"));
    directories.push(parent);
    const directory = join(parent, "vibeCheck");
    const filePath = join(directory, "credentials.v1.json");

    await new SettingsStore(filePath, protector).save({ smartyAuthId: "auth-id" });

    const fileMode = (await stat(filePath)).mode & 0o777;
    const directoryMode = (await stat(directory)).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(directoryMode).toBe(0o700);
  });

  test("fails closed when operating-system encryption is unavailable", async () => {
    const store = new SettingsStore("unused", { ...protector, isEncryptionAvailable: () => false });
    await expect(store.save({ smartyAuthId: "id" })).rejects.toThrow("Secure credential storage is unavailable");
  });
});
