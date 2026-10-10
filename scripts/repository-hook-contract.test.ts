import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository Git hooks", () => {
  it("lints the staged workspace with the source-tree CLI", () => {
    const content = readFileSync("scripts/check-staged.sh", "utf8");

    expect(content).toContain(
      "pnpm --config.verify-deps-before-run=error axm:local lint --staged --strict",
    );
    expect(content).not.toMatch(/^axm lint/m);
  });

  it("leaves broad verification to explicit workflows and CI", () => {
    expect(existsSync(".husky/pre-push")).toBe(false);
  });
});
