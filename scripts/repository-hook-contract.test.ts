import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readHook = (name: string): string => readFileSync(`.husky/${name}`, "utf8");

describe("repository Git hooks", () => {
  it("lints the staged workspace with the source-tree CLI", () => {
    const content = readHook("pre-commit");

    expect(content).toContain("pnpm axm:local lint --view git-index --strict");
    expect(content).not.toMatch(/^axm lint/m);
  });

  it("leaves broad verification to explicit workflows and CI", () => {
    expect(existsSync(".husky/pre-push")).toBe(false);
  });
});
