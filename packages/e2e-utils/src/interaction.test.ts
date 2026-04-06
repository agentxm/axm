import { describe, expect, it } from "vitest";
import { isCI, isHumanInteractive } from "@axm.sh/utils/unstable/interaction";

describe("interaction", () => {
  it("re-exports CI detection", () => {
    expect(isCI({ CI: "true" })).toBe(true);
  });

  it("re-exports human-interactive detection", () => {
    expect(isHumanInteractive({ isTTY: true, env: { CLAUDECODE: "1" } })).toBe(false);
  });
});
