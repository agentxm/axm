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
      // Test support excluded from the library build and the published files.
      "apps/cli/src/test-support/**",
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
      "packages/core/workspace-lint/src/testing.ts",
      // Colocated test support: drives its package's use cases from tests and
      // specifications with the deterministic ports its dependencies publish.
      "packages/core/workspace-configuration/src/**/test-helpers.ts",
      "packages/core/workspace-lint/src/**/test-helpers.ts",
      "packages/core/extension-lifecycle/src/**/test-helpers.ts",
      "packages/core/extension-publish/src/**/test-helpers.ts",
      "packages/core/workspace-sync/src/**/test-helpers.ts",
      "packages/core/workspace-reconciliation/src/**/test-helpers.ts",
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

/**
 * The CLI handler boundary carries its own exception list, for the opposite
 * reason: not composition of implementations, but command families that own
 * no feature and so must reach what a handler normally may not. The first
 * case proves the restriction reports as an error through the repository's
 * real flat configuration; the second pins the list so it cannot widen
 * silently.
 */
describe("CLI handler boundary exceptions", () => {
  let restrictedImports: (
    code: string,
    filePath: string,
  ) => Promise<ReadonlyArray<{ readonly severity: number; readonly message: string }>>;

  beforeAll(() => {
    const eslint = new ESLint({ cwd: repoRoot });
    restrictedImports = async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath });
      return (result?.messages ?? [])
        .filter((message) => message.ruleId === "@typescript-eslint/no-restricted-imports")
        .map((message) => ({ severity: message.severity, message: message.message }));
    };
  });

  it("reports a handler reaching the Registry client as an error, not a warning", async () => {
    const reported = await restrictedImports(
      'import { makeUserArchiveCache } from "@agentxm/registry-client";\nvoid makeUserArchiveCache;\n',
      "apps/cli/src/root/list/command.ts",
    );
    expect(reported.map((message) => message.severity)).toEqual([2]);
  });

  it("permits the exempt command families that own no feature", async () => {
    expect(
      await restrictedImports(
        'import { makeUserArchiveCache } from "@agentxm/registry-client";\nvoid makeUserArchiveCache;\n',
        "apps/cli/src/root/cache/command.ts",
      ),
    ).toEqual([]);
  });

  it("exempts exactly the named command families", () => {
    const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
    const declarationStart = eslintConfig.indexOf("const cliHandlerBoundaryExceptions = [");
    expect(declarationStart).toBeGreaterThan(-1);
    const declarationEnd = eslintConfig.indexOf("];", declarationStart);
    expect(eslintConfig.slice(declarationStart, declarationEnd + 2)).toBe(
      `const cliHandlerBoundaryExceptions = [
  // \`cache *\` is a CLI-adapter-only command family: the archive cache is the
  // Registry client's own on-disk store, and no feature owns it.
  "apps/cli/src/root/cache/**",
];`,
    );
  });
});
