import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** Source-only policy evidence, independent of CLI artifacts and specification receipts. */
export default defineConfig({
  root: projectRoot,
  resolve: { conditions: ["axm-source"] },
  test: {
    include: [
      "src/skills/domain/**/*.test.ts",
      "src/skills/application/**/*.test.ts",
      "src/subagents/domain/**/*.test.ts",
      "src/subagents/application/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["src/skills/domain/**/*.ts", "src/subagents/domain/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      reportsDirectory: "../../../test-results/policy-quality/coverage",
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
