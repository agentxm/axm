import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** Source-only policy evidence, independent of CLI artifacts and specification receipts. */
export default defineConfig({
  root: projectRoot,
  ssr: { resolve: { conditions: ["axm-source", ...defaultServerConditions] } },
  test: {
    include: [
      "src/skills/lifecycle/domain/**/*.test.ts",
      "src/skills/lifecycle/application/**/*.test.ts",
      "src/subagents/lifecycle/domain/**/*.test.ts",
      "src/subagents/lifecycle/application/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["src/skills/lifecycle/domain/**/*.ts", "src/subagents/lifecycle/domain/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      reportsDirectory: "../../../test-results/policy-quality/coverage",
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
