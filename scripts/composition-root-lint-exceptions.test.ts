import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Environment-backed and in-memory service implementations are composed only
 * at the application composition root: production source elsewhere may not
 * import `@agentxm/*\/live` or `@agentxm/*\/testing`.
 *
 * Supersedes the retired specification identity
 * `system/architecture/live-composition-stays-in-application`
 * (see `specifications/disposition-ledger.json`). The first case proves the
 * restriction actually reports through the repository's real flat
 * configuration; the second pins the exception list so it cannot widen
 * silently.
 */
describe("composition-root import restriction", () => {
  let restrictedImports: (code: string, filePath: string) => Promise<ReadonlyArray<string>>;

  beforeAll(() => {
    const eslint = new ESLint({ cwd: repoRoot });
    restrictedImports = async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath });
      return (result?.messages ?? [])
        .filter((message) => message.ruleId === "no-restricted-imports")
        .map((message) => message.message);
    };
  });

  it("reports a production module composing an environment-backed or in-memory implementation", async () => {
    expect(
      await restrictedImports(
        'import { WorkspaceCatalogLive } from "@agentxm/workspace-projection/live";\nvoid WorkspaceCatalogLive;\n',
        "packages/core/workspace-sync/src/index.ts",
      ),
    ).not.toEqual([]);
    expect(
      await restrictedImports(
        'import { PlanInvocationTest } from "@agentxm/workspace-operations/testing";\nvoid PlanInvocationTest;\n',
        "packages/core/workspace-sync/src/index.ts",
      ),
    ).not.toEqual([]);
  });

  it("permits the application composition root to compose them", async () => {
    expect(
      await restrictedImports(
        'import { PlanInvocationTest } from "@agentxm/workspace-operations/testing";\nvoid PlanInvocationTest;\n',
        "apps/cli/src/runtime.ts",
      ),
    ).toEqual([]);
  });

  it("exempt exactly the composition root, the named test-support modules, and test files", () => {
    const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
    const restrictionIndex = eslintConfig.indexOf('group: ["@agentxm/*/live"]');
    expect(restrictionIndex).toBeGreaterThan(-1);
    const ignoresStart = eslintConfig.lastIndexOf("ignores: [", restrictionIndex);
    expect(ignoresStart).toBeGreaterThan(-1);
    const ignoresEnd = eslintConfig.indexOf("],", ignoresStart);
    expect(eslintConfig.slice(ignoresStart, ignoresEnd + 2)).toBe(
      `ignores: [
      "apps/cli/src/runtime.ts",
      "apps/cli/src/test-helpers.ts",
      // Test support excluded from the library build and the published files.
      "apps/cli/src/test-support/**",
      // Published specification adapter exposes real services to boundary tests.
      "apps/cli/src/specification-harness.ts",
      "packages/core/workspace-lint/src/catalog/workspace/conformance/test-helpers.ts",
      // Composes the real workspace an authoring specification observes.
      "packages/core/extension-authoring/src/test-support/authoring-workspace.ts",
      // Composes the real workspace and Registry an inspection specification
      // installs into before observing what \`show\` reports.
      "packages/core/workspace-inspection/src/test-support/installed-workspace.ts",
      // Published deterministic fixtures: each composes the real services its
      // package's specifications observe.
      "packages/core/knowledge-query/src/testing.ts",
      "packages/core/workspace-inspection/src/testing.ts",
      "packages/core/workspace-configuration/src/testing.ts",
      "packages/core/extension-lifecycle/src/testing.ts",
      // Colocated test support: drives its package's use cases from tests and
      // specifications with the deterministic ports its dependencies publish.
      "packages/core/workspace-configuration/src/**/test-helpers.ts",
      "packages/core/extension-lifecycle/src/**/test-helpers.ts",
      // Plan-family fixtures, excluded from the library build: the plan
      // specifications observe the real transaction scope over a temporary
      // workspace with the deterministic state ports its dependency publishes.
      "packages/core/workspace-operations/src/plan/__tests__/plan-spec-support.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],`,
    );
  });
});
