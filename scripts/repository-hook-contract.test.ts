import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readHook = (name: string): string => readFileSync(`.husky/${name}`, "utf8");

describe("repository Git hooks", () => {
  it.each([
    ["pre-commit", "pnpm axm:local lint --view git-index --strict"],
    ["pre-push", "pnpm axm:local lint --strict"],
  ])("runs %s lint with the source-tree CLI", (hook, invocation) => {
    const content = readHook(hook);

    expect(content).toContain(invocation);
    expect(content).not.toMatch(/^axm lint/m);
  });
});
