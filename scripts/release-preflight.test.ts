import { describe, expect, it } from "vitest";

import { validateReleasePreparationSource } from "./release-preflight.js";

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
