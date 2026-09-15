import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Concrete implementations compose at designated application/package roots
 * and named test fixtures. Feature source keeps implementation selection out
 * of its imports.
 *
 * Supersedes the retired specification identity
 * `system/architecture/live-composition-stays-in-application`
 * (see `specifications/disposition-ledger.json`). These cases exercise the
 * repository's resolved ESLint configuration.
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
        'import { WorkspaceCatalogLive } from "@agentxm/workspace/projection/live";\nvoid WorkspaceCatalogLive;\n',
        "packages/core/workspace-sync/src/index.ts",
      ),
    ).not.toEqual([]);
    expect(
      await restrictedImports(
        'import { PlanInvocationTest } from "@agentxm/workspace/transitions/planning/testing";\nvoid PlanInvocationTest;\n',
        "packages/core/workspace-sync/src/index.ts",
      ),
    ).not.toEqual([]);
  });

  it("permits the application composition root to compose them", async () => {
    expect(
      await restrictedImports(
        'import { PlanInvocationTest } from "@agentxm/workspace/transitions/planning/testing";\nvoid PlanInvocationTest;\n',
        "apps/cli/src/runtime.ts",
      ),
    ).toEqual([]);
  });
});

/**
 * The CLI handler boundary carries its own exception list, for the opposite
 * reason: not composition of implementations, but command families that own
 * no feature and so must reach what a handler normally may not. These cases
 * exercise the restriction and its permitted command family through ESLint.
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
});
