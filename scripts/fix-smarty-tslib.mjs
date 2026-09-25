/**
 * The Smarty SDK's published builds import a tslib copy they vendor under
 * dist/<format>/node_modules by relative path. electron-builder prunes nested
 * node_modules when it collects dependencies, so that path does not exist in the
 * packaged app and the main process fails to start with ERR_MODULE_NOT_FOUND.
 *
 * This rewrites the specifier to the bare package name and removes the vendored
 * directory, so both the packaged app and a local run resolve the hoisted tslib.
 * Removing the directory matters: Node stops at the nearest node_modules, and the
 * vendored one has no package.json, so a bare import would fail while it exists.
 *
 * Safe to run repeatedly. Run before packaging.
 */
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const distDirectory = "node_modules/smartystreets-javascript-sdk/dist";
const vendoredImport = "./node_modules/tslib/tslib.es6.";

async function useHoistedTslib(format) {
  const directory = join(distDirectory, format);
  let rewritten = 0;

  for (const name of await readdir(directory)) {
    if (!name.endsWith(".mjs") && !name.endsWith(".cjs")) {
      continue;
    }

    const file = join(directory, name);
    const source = await readFile(file, "utf8");
    if (!source.includes(vendoredImport)) {
      continue;
    }

    const fixed = source
      .replaceAll(`"${vendoredImport}mjs"`, '"tslib"')
      .replaceAll(`"${vendoredImport}cjs"`, '"tslib"')
      .replaceAll(`'${vendoredImport}mjs'`, "'tslib'")
      .replaceAll(`'${vendoredImport}cjs'`, "'tslib'");
    await writeFile(file, fixed);
    rewritten += 1;
  }

  await rm(join(directory, "node_modules"), { force: true, recursive: true });
  return rewritten;
}

const counts = await Promise.all(["esm", "cjs"].map(useHoistedTslib));
const total = counts.reduce((sum, count) => sum + count, 0);
console.log(`fix-smarty-tslib: rewrote ${total} file(s); vendored tslib removed`);
