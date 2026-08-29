import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting } from "../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "unit", suite: "scripts" }),
    include: ["**/*.test.ts"],
    testTimeout: 20000,
  },
});
