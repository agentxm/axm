import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readHook = (name: string): string => readFileSync(`.husky/${name}`, "utf8");

describe("repository Git hooks", () => {
  it("lints the staged workspace with the source-tree CLI", () => {
    const content = readHook("pre-commit");

    expect(content).toContain("pnpm axm:local lint --view git-index --strict");
    expect(content).not.toMatch(/^axm lint/m);
  });

  it("validates the staged Gen Stack corpus", () => {
    expect(readHook("pre-commit")).toContain("pnpm run gen-stack:check -- --view git-index");
  });

  it("runs the canonical affected verification path before push", () => {
    const content = readHook("pre-push");

    expect(content).toContain("export NX_BASE=origin/main");
    expect(content).toContain("export NX_HEAD=HEAD");
    expect(content).toContain("pnpm run verify:affected");
  });
});
