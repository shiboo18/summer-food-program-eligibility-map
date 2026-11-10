import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/build/**", "**/dist/**"],
    silent: "passed-only",
    reporters: ["default", "junit"],
    outputFile: "build/unit-tests/TESTS-TestSuites.xml",
    coverage: {
      /*
       * The paths where a silent mistake reaches a partner's data: the checks,
       * workbook reads and writes, persistence, and what the renderer may do.
       * Presentation is left out: this suite has no DOM, so its number would not
       * be actionable.
       */
      include: [
        "packages/backend/src/core/**/*.ts",
        "packages/backend/src/services/**/*.ts",
        "packages/desktop/src/main/navigation.ts",
        "packages/desktop/src/main/permissions.ts",
        "packages/desktop/src/renderer/workflow/single-flight.ts",
      ],
      thresholds: { statements: 50, branches: 50, functions: 50, lines: 50 },
      skipFull: true,
      reporter: ["text-summary", "html", "cobertura"],
      reportsDirectory: "build/coverage",
    },
  },
});
