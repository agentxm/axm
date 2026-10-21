import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository Git hooks", () => {
  it("starts the published staged commit gate by its Node path, never through pnpm", () => {
    const lines = readFileSync(".husky/pre-commit", "utf8").trimEnd().split("\n");

    expect(lines).toEqual([
      "#!/usr/bin/env sh",
      "node node_modules/@agentxm/workspace-conventions/bin/check-staged.mjs scripts/check-staged.checks.sh",
    ]);
  });

  it("lints the staged workspace with the source-tree CLI", () => {
    const content = readFileSync("scripts/check-staged.checks.sh", "utf8");

    expect(content).toContain(
      "pnpm --config.verify-deps-before-run=error axm:local lint --staged --strict",
    );
    expect(content).not.toMatch(/^axm lint/m);
  });

  it("leaves broad verification to explicit workflows and CI", () => {
    expect(existsSync(".husky/pre-push")).toBe(false);
  });
});
