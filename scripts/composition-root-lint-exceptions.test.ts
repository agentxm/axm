import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * The import restriction on `@agentxm/*\/live` and `@agentxm/*\/testing` in
 * production source is bound as evidence to the
 * `system/architecture/live-composition-stays-in-application` specification.
 * Which non-test modules are exempt is realization detail: the application
 * composition root and the explicitly named test-support modules. This test
 * pins that exception list so it cannot widen silently.
 */
describe("composition-root import restriction exceptions", () => {
  it("exempt exactly the composition root, the named test-support modules, and test files", () => {
    const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
    const restrictionIndex = eslintConfig.indexOf('group: ["@agentxm/*/live"]');
    expect(restrictionIndex).toBeGreaterThan(-1);
    const ignoresStart = eslintConfig.lastIndexOf("ignores: [", restrictionIndex);
    expect(ignoresStart).toBeGreaterThan(-1);
    const ignoresEnd = eslintConfig.indexOf("],", ignoresStart);
    expect(eslintConfig.slice(ignoresStart, ignoresEnd + 2)).toBe(
      `ignores: [
      "packages/cli/src/runtime.ts",
      "packages/cli/src/test-helpers.ts",
      // Published specification adapter exposes real services to boundary tests.
      "packages/cli/src/specification-harness.ts",
      "packages/workspace-lint/src/catalog/workspace/conformance/test-helpers.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],`,
    );
  });
});
