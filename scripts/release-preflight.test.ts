import { describe, expect, it } from "vitest";

import { selectReleasedSkillTag } from "./release-preflight.js";

describe("release preflight tag selection", () => {
  it("uses the current version when its release tag exists", () => {
    expect(selectReleasedSkillTag("0.29.3", ["cli-v0.29.2", "cli-v0.29.3"])).toBe("cli-v0.29.3");
  });

  it("uses the latest prior release after an unpublished candidate", () => {
    expect(selectReleasedSkillTag("0.29.3", ["cli-v0.28.13", "cli-v0.29.2"])).toBe("cli-v0.29.2");
  });

  it("ignores malformed and newer release tags", () => {
    expect(selectReleasedSkillTag("0.29.3", ["cli-vnext", "cli-v0.29.4", "cli-v0.29.1"])).toBe(
      "cli-v0.29.1",
    );
  });

  it("fails when no eligible release tag is reachable", () => {
    expect(() => selectReleasedSkillTag("0.29.3", ["cli-v0.29.4"])).toThrow(
      "No reachable released CLI tag exists at or before the current version 0.29.3.",
    );
  });
});
