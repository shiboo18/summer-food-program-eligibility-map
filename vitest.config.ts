import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/build/**", "**/dist/**"],
    silent: "passed-only",
    reporters: ["default", "junit"],
    outputFile: "build/unit-tests/TESTS-TestSuites.xml",
    coverage: {
      /*
       * The paths where a silent mistake reaches a partner's data: the checks
       * themselves, what is read from and written to their workbook, what is
       * persisted, what the renderer is allowed to do, and which screens a run is
       * allowed to pass through. Presentation is left out — there is no DOM in this
       * suite, so counting it only produces a number nobody can act on.
       */
      include: [
        "packages/backend/src/core/**/*.ts",
        "packages/backend/src/services/**/*.ts",
        "packages/desktop/src/main/navigation.ts",
        "packages/desktop/src/main/permissions.ts",
        "packages/desktop/src/renderer/settings/cell-mapping.ts",
        "packages/desktop/src/renderer/workflow/address-fields.ts",
        "packages/desktop/src/renderer/workflow/screen-skips.ts",
        "packages/desktop/src/renderer/workflow/single-flight.ts",
        "packages/desktop/src/shared/cell-reference.ts",
      ],
      thresholds: { statements: 50, branches: 50, functions: 50, lines: 50 },
      skipFull: true,
      reporter: ["text-summary", "html", "cobertura", "json-summary"],
      reportsDirectory: "build/coverage",
    },
  },
});
