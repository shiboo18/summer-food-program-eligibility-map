# AGENTS.md — vibeCheck

Guide for agents and contributors working in this package. Read this before writing code.

## What this is

A local-first **Electron desktop app** ("vibeCheck") for Share Our Strength / No Kid Hungry.
Partners load an enrollment spreadsheet, map its address columns, choose validation checks, and get
results — all on their own machine. Addresses only leave the computer for the partner's own Smarty
account; USDA eligibility is computed against public USDA/ArcGIS data.

Wizard flow: **Upload → Map columns → Checks → Results**.

## Layout

npm-workspaces monorepo, TypeScript, **ESM** (Node ≥ 24).

```
packages/
  backend/   # pure logic, NO electron imports — unit-tested with vitest
    src/
      contracts.ts         # every interface the app codes against — no implementation
      types/<domain>.ts    # domain shapes, re-exported by types/index.ts
      services/<vendor>/   # IMPLEMENTATIONS of those contracts
      core/                # our own orchestration over the contracts
      config/              # constants (endpoints, field names, thresholds)
      index.ts             # re-exports the package's public API
  desktop/   # electron: main / preload / renderer / shared
    src/
      main/       # main process, IPC handlers
      preload/    # contextBridge surface (bridge.*)
      renderer/   # vanilla DOM UI, workflow step registry
      shared/     # types shared across processes
```

## Architecture conventions (follow exactly)

**Contracts vs implementations.** `contracts.ts` holds the interfaces (e.g. `AddressValidator`,
`Geocoder`) and `types/<domain>.ts` the shapes they exchange; `services/<vendor>/` holds concrete
classes implementing them. The renderer/main talk to interfaces, never directly to a vendor class
where an interface exists.

**Types** (`types/<domain>.ts`):
- Every field `readonly`; arrays `readonly T[]`.
- Prefer string-literal unions over enums (e.g. `type AddressVerificationStatus = "verified" | "corrected" | "unverified"`).
- `index.ts` re-exports with `export type { ... }`.

**Services** (dependency injection + a network seam):
- Inject collaborators via the constructor.
- Isolate the network behind an injectable seam with a **real default** — e.g. Smarty's
  `createClient` factory, or the `HttpGetClient` the USDA/Esri services depend on — so tests stub it
  and never hit the network.
- Wrap external failures in a domain error with `{ cause }`; **never leak provider/SDK details** or
  secrets in the message.

**Keying.** Spreadsheet rows are keyed by positional `rowNumber` end to end. Preserve it.

**Non-destructive results.** Never overwrite the user's original columns; results are added as new
columns / shown in the UI.

**Constants.** All external URLs, ArcGIS layer ids, feature field names, thresholds, and the dataset
year live in `config/constants.ts`. Do not inline them in services.

**Imports.** ESM with explicit `.js` suffixes on relative imports (even from `.ts` sources).

**Dead code.** `noUnusedLocals` and `noUnusedParameters` are on, so an unused local, import, or
parameter fails the build. Prefix a parameter with `_` when the signature you implement requires one
you do not use.

**Comments.** Sparingly; explain *why*, not *what*. No ticket/plan/iteration references in code.

## Tests

- Vitest, co-located in `__tests__/` next to the source file.
- Style: `describe/test/expect`, `vi.fn()` for stubs — match the existing specs.
- Cover happy path, each error path, and edge cases. Mock payloads must mirror real API response
  shapes.
- **Never delete a test or assertion to make a build pass** — fix the code.
- Coverage globs are in `vitest.config.ts`; new `core/**` and `services/**` files are included
  automatically.

Note: ArcGIS/Esri REST endpoints return **errors as HTTP 200 with an `error` field** in the JSON
body — handle that explicitly in service code, don't rely on HTTP status alone.

## Build & test

```bash
# from the repository root
npm ci
npm run build                      # tsc -b + copy-static -> packages/*/dist
npx vitest run                     # unit tests (npm test runs them with coverage)
npm run typecheck:tests            # typechecks the specs, which `npm run build` excludes
./node_modules/.bin/electron .     # launch the desktop app (add --no-sandbox if the shell blocks it)
./node_modules/.bin/electron . --smoke-test   # headless startup check
```

Always `npm run build` and run tests before committing.

`npm run build` deliberately excludes the specs, so a stub that has drifted from the interface it
doubles for — or a type import with a wrong path, which vitest erases and never reports — compiles
and passes. `npm run typecheck:tests` is what catches that; run it after changing a mock or a
contract.

## Modules

- **Module 1 — Address validation** (built): Smarty via `SmartyAddressValidator`.
- **Module 2 — USDA rural eligibility** (Siddhartha): shares the checks step + results table.
- **Module 3 — USDA area eligibility** (this workstream): geocode → rural → 3-state area
  eligibility. Key rule: read the **3-state `FY26_Eligibility`** field (Eligible / Averaged
  Eligible / Not Eligible), not the orange-only `ELIGFY26`; and gate results on geocode score
  (`< 100` ⇒ flag "please verify"). The validated endpoints, layer ids, and field names are the
  ones in `config/constants.ts` — verify against the live service before shipping a new dataset year.
