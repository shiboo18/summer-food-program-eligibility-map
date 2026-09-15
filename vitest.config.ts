import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/build/**",
      "**/dist/**",
    ],
    silent: "passed-only",
    reporters: ["default", "junit"],
    outputFile: "build/brazil-unit-tests/TESTS-TestSuites.xml",
    coverage: {
      include: ["src/**/*.ts"],
      skipFull: true,
      reporter: ["text-summary", "html", "cobertura"],
      reportsDirectory: "build/brazil-documentation/coverage",
    },
  },
});
