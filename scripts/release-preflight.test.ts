import { describe, expect, it } from "vitest";

import { selectReleasedSkillTag, validateReleasePreparationSource } from "./release-preflight.js";

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

describe("release preparation source validation", () => {
  const source = "0123456789abcdef0123456789abcdef01234567";

  it("accepts an exact checkout at current origin/main", () => {
    expect(() => validateReleasePreparationSource(source, source, source)).not.toThrow();
  });

  it("rejects symbolic and abbreviated source revisions", () => {
    for (const invalid of ["main", source.slice(0, 12), source.toUpperCase()]) {
      expect(() => validateReleasePreparationSource(invalid, source, source)).toThrow(
        "exact 40-character lowercase commit SHA",
      );
    }
  });

  it("rejects a checkout that does not match the declared source", () => {
    expect(() => validateReleasePreparationSource(source, "1".repeat(40), source)).toThrow(
      "release preparation declared",
    );
  });

  it("rejects a declared source after main advances", () => {
    expect(() => validateReleasePreparationSource(source, source, "2".repeat(40))).toThrow(
      "prepare from current main",
    );
  });
});
