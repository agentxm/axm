/**
 * Tests for pure functions module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { computeInstallPath, type SkillSource, versionsEqual } from "./pure-functions.js";

describe("computeInstallPath", () => {
  describe("Registry sources", () => {
    it("computes external path for registry source", () => {
      const source: SkillSource = {
        type: "registry",
        scope: "@community",
        name: "commit",
      };

      const path = computeInstallPath(source, "commit");

      expect(path).toBe(".axm/extensions/external/skills/commit");
    });

    it("uses skill name parameter for path", () => {
      const source: SkillSource = {
        type: "registry",
        scope: "@community",
        name: "commit",
      };

      const path = computeInstallPath(source, "different-name");

      expect(path).toBe(".axm/extensions/external/skills/different-name");
    });
  });

  describe("GitHub sources", () => {
    it("computes external path for GitHub source", () => {
      const source: SkillSource = {
        type: "github",
        owner: "anthropics",
        repo: "claude-skills",
        ref: Option.some("main"),
        subPath: Option.some("skills/commit"),
      };

      const path = computeInstallPath(source, "commit");

      expect(path).toBe(".axm/extensions/external/skills/commit");
    });

    it("computes external path regardless of ref and subpath", () => {
      const source: SkillSource = {
        type: "github",
        owner: "user",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      };

      const path = computeInstallPath(source, "my-skill");

      expect(path).toBe(".axm/extensions/external/skills/my-skill");
    });
  });

  describe("Local sources", () => {
    it("computes external path for local source", () => {
      const source: SkillSource = {
        type: "local",
        path: "/Users/dev/my-skill",
      };

      const path = computeInstallPath(source, "my-skill");

      expect(path).toBe(".axm/extensions/external/skills/my-skill");
    });

    it("computes external path for any local path", () => {
      const source: SkillSource = {
        type: "local",
        path: "../relative/path/to/skill",
      };

      const path = computeInstallPath(source, "relative-skill");

      expect(path).toBe(".axm/extensions/external/skills/relative-skill");
    });
  });

  describe("edge cases", () => {
    it("handles skill names with hyphens", () => {
      const source: SkillSource = {
        type: "local",
        path: "/path",
      };

      const path = computeInstallPath(source, "my-complex-skill-name");

      expect(path).toBe(".axm/extensions/external/skills/my-complex-skill-name");
    });

    it("handles registry source", () => {
      const source: SkillSource = {
        type: "registry",
        scope: "@community",
        name: "commit",
      };

      const path = computeInstallPath(source, "skill");

      expect(path).toBe(".axm/extensions/external/skills/skill");
    });
  });
});

// =============================================================================
// versionsEqual Tests
// =============================================================================

describe("versionsEqual", () => {
  describe("both None", () => {
    it("returns true when both are None", () => {
      const result = versionsEqual(Option.none(), Option.none());
      expect(result).toBe(true);
    });
  });

  describe("one None, one Some", () => {
    it("returns false when first is None and second is Some", () => {
      const result = versionsEqual(Option.none(), Option.some("1.0.0"));
      expect(result).toBe(false);
    });

    it("returns false when first is Some and second is None", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.none());
      expect(result).toBe(false);
    });
  });

  describe("both valid semver", () => {
    it("returns true for equal semver versions", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.some("1.0.0"));
      expect(result).toBe(true);
    });

    it("returns false for different semver versions", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.some("2.0.0"));
      expect(result).toBe(false);
    });

    it("returns true for equivalent prerelease versions", () => {
      const result = versionsEqual(Option.some("1.0.0-beta.1"), Option.some("1.0.0-beta.1"));
      expect(result).toBe(true);
    });

    it("returns false for different prerelease versions", () => {
      const result = versionsEqual(Option.some("1.0.0-alpha"), Option.some("1.0.0-beta"));
      expect(result).toBe(false);
    });
  });

  describe("both non-semver strings", () => {
    it("returns true for identical non-semver strings", () => {
      const result = versionsEqual(Option.some("abc123"), Option.some("abc123"));
      expect(result).toBe(true);
    });

    it("returns false for different non-semver strings", () => {
      const result = versionsEqual(Option.some("abc123"), Option.some("def456"));
      expect(result).toBe(false);
    });

    it("handles git-like hashes", () => {
      const result = versionsEqual(Option.some("a1b2c3d4e5f6"), Option.some("a1b2c3d4e5f6"));
      expect(result).toBe(true);
    });

    it("returns false for different git-like hashes", () => {
      const result = versionsEqual(Option.some("a1b2c3d4e5f6"), Option.some("f6e5d4c3b2a1"));
      expect(result).toBe(false);
    });
  });

  describe("mixed (one semver, one non-semver)", () => {
    it("returns false when comparing semver to non-semver", () => {
      // Falls back to string equality, which is false
      const result = versionsEqual(Option.some("1.0.0"), Option.some("abc123"));
      expect(result).toBe(false);
    });

    it("returns false when comparing non-semver to semver", () => {
      // Falls back to string equality, which is false
      const result = versionsEqual(Option.some("abc123"), Option.some("1.0.0"));
      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty strings as non-semver", () => {
      const result = versionsEqual(Option.some(""), Option.some(""));
      expect(result).toBe(true);
    });

    it("returns false for empty string vs valid semver", () => {
      const result = versionsEqual(Option.some(""), Option.some("1.0.0"));
      expect(result).toBe(false);
    });

    it("handles versions with build metadata", () => {
      // semver.eq ignores build metadata per spec
      const result = versionsEqual(Option.some("1.0.0+build1"), Option.some("1.0.0+build2"));
      expect(result).toBe(true);
    });
  });
});
