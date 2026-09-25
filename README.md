# vibeCheck

vibeCheck is an Electron and TypeScript desktop app for a sponsor to verify beneficiary
addresses with Smarty. The first-run education flow is page-based, and the
main screen accepts validated Excel workbook selections.

## Structure

- `packages/desktop`: Electron main process, preload, renderer, and UI helpers.
- `packages/backend`: Smarty validation, encrypted credentials, and preferences.

## Commands

```bash
# Build and test
brazil-build release

# Build and open the app
scripts/run-app.sh

# Verify Electron startup without opening a window
brazil-build run smoke
```

Address input remains in memory. Smarty credentials are stored with operating-
system encryption. Theme, accessibility, and first-run preferences are stored
in Electron's application data directory.

## Packaging

Desktop installers are produced with electron-builder, configured in
`electron-builder.yml`. Run all packaging commands from this package root: the
packaged entry point resolves `packages/desktop/dist` and `packages/backend/dist`
relative to here, and production dependencies are hoisted into the root
`node_modules`.

electron-builder only packages already-compiled output; it does not run the
TypeScript build or a dependency install. Prepare the tree first:

```bash
# 1. Populate the hoisted node_modules from the internal registry
brazil-build install

# 2. Compile: tsc -b + copy-static.mjs -> packages/*/dist
#    (electron-builder 26.3.6 is already a root devDependency)
npm run build
```

Then build platform artifacts (output goes to `build/electron/`, which is
ignored by git):

```bash
npm run package:mac   # dmg + zip for arm64 and x64
npm run package:win   # nsis installer for x64 (cross-builds from macOS)
```

The `files` whitelist ships compiled backend and desktop output, the workspace
package manifests, and the root manifest; electron-builder automatically adds
the required production dependencies (for example the Smarty SDK) from the root
`node_modules`.

### Signing

Artifacts are unsigned by default so local builds are self-contained and
deterministic. macOS uses `identity: null` (Gatekeeper warns on first launch)
and Windows sets `signAndEditExecutable: false` (SmartScreen warns). To sign
later, add a macOS Developer ID (or internal) identity with the matching
hardened-runtime and notarization settings, or supply a Windows certificate via
the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables. No placeholder
signing or notarization values are committed.

### Icons

Packaging icons live in `build-resources/`, generated from the 512x512
`packages/desktop/src/renderer/assets/vibecheck-icon.png` using locally
available tools (`iconutil`/`sips` for `.icns`, ImageMagick for `.ico`):

- `build-resources/icon.icns` — macOS
- `build-resources/icon.ico` — Windows (16 through 256 px)

Limitation: the source PNG is 512x512. macOS `.icns` therefore tops out at
512 px rather than the 1024 px electron-builder prefers, so Retina rendering at
the largest size is not as crisp as a native 1024 px source would allow. Supply
a 1024x1024 source and regenerate `icon.icns` to remove this limitation. The
in-app renderer icons are unchanged; the packaging icons are separate assets.
