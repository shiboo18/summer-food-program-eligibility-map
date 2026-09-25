import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = resolve(packageRoot, "packages/desktop/src/renderer");
const rendererOutput = resolve(packageRoot, "packages/desktop/dist/renderer");
const assetsOutput = resolve(rendererOutput, "assets");
const fontOutput = resolve(rendererOutput, "fonts");

await Promise.all([
  mkdir(rendererOutput, { recursive: true }),
  mkdir(assetsOutput, { recursive: true }),
  mkdir(fontOutput, { recursive: true }),
]);
await Promise.all([
  ...["index.html", "styles.css"].map((fileName) =>
    copyFile(resolve(rendererSource, fileName), resolve(rendererOutput, fileName)),
  ),
  ...["vibecheck-icon.svg", "vibecheck-icon.png"].map((fileName) =>
    copyFile(resolve(rendererSource, "assets", fileName), resolve(assetsOutput, fileName)),
  ),
  copyFile(
    resolve(
      packageRoot,
      "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
    ),
    resolve(fontOutput, "manrope-latin-wght-normal.woff2"),
  ),
]);
