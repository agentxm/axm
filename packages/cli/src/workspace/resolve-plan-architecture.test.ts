import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";

const cliRoot = path.resolve(import.meta.dirname, "..");

const readCliFile = (relativePath: string): string =>
  fs.readFileSync(path.join(cliRoot, relativePath), "utf8");

describe("resolvePlan architecture guardrails", () => {
  it("operation metadata registry depends on metadata modules only", () => {
    const registry = readCliFile("workspace/operation-registry.ts");

    expect(registry).toContain("operations/metadata.js");
    expect(registry).not.toContain("operations/install.js");
    expect(registry).not.toContain("operations/uninstall.js");
    expect(registry).not.toContain("workspace/service.js");
  });

  it("install command handlers stay thin and resolve through workspace", () => {
    const skillInstallHandler = readCliFile("cli-commands/skills/install/handler.ts");
    const packInstallHandler = readCliFile("cli-commands/packs/install/handler.ts");

    expect(skillInstallHandler).toContain("buildSkillInstallPlan");
    expect(skillInstallHandler).toContain("ws.resolvePlan(");
    expect(skillInstallHandler).not.toContain("applyPlan(");

    expect(packInstallHandler).toContain("buildInstallPlan");
    expect(packInstallHandler).toContain("ws.resolvePlan(");
    expect(packInstallHandler).not.toContain("applyPlan(");
  });
});
