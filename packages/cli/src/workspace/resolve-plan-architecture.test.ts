import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";

const cliRoot = path.resolve(import.meta.dirname, "..");

const readCliFile = (relativePath: string): string =>
  fs.readFileSync(path.join(cliRoot, relativePath), "utf8");

describe("resolvePlan architecture guardrails", () => {
  it("install command handlers delegate to shared workflows", () => {
    const skillInstallHandler = readCliFile("cli-commands/skills/install/handler.ts");
    const packInstallHandler = readCliFile("cli-commands/packs/install/handler.ts");

    // Both delegate to shared install command workflow
    expect(skillInstallHandler).toContain("runInstallCommandWorkflow");
    expect(skillInstallHandler).not.toContain("applyPlan(");

    expect(packInstallHandler).toContain("runInstallCommandWorkflow");
    expect(packInstallHandler).not.toContain("applyPlan(");
  });
});
