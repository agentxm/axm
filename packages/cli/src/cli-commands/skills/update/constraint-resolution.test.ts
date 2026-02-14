/**
 * Tests for constraint resolution logic.
 *
 * Covers:
 * - 7.1: Constraint collection (user vs pack constraints)
 * - 7.2: Multi-constraint resolution (intersection, incompatible)
 * - 7.3: Update warnings (holdback detection)
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import {
  resolveConstrainedVersion,
  detectHoldbackWarnings,
  type SkillConstraints,
} from "./constraint-resolution.js";

// -----------------------------------------------------------------------------
// 7.1: Constraint collection / priority
// -----------------------------------------------------------------------------

describe("resolveConstrainedVersion", () => {
  const versions = ["2.0.0", "1.3.0", "1.2.0", "1.1.0", "1.0.0"];

  describe("user constraint priority", () => {
    it("uses user explicit constraint when not *", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("^1.0.0"),
        packConstraints: [{ packName: "pack-a", constraint: "^2.0.0" }],
      };

      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      const resolved = Option.getOrThrow(result);
      // User constraint ^1.0.0 matches 1.3.0 (newest in ^1.x range), ignores pack ^2.0.0
      expect(resolved.resolvedVersion).toBe("1.3.0");
      expect(resolved.warnings).toHaveLength(0);
    });

    it("returns none when user constraint is unsatisfiable", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("^3.0.0"),
        packConstraints: [],
      };

      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isNone(result)).toBe(true);
    });

    it("applies pack constraints when user has *", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("*"),
        packConstraints: [{ packName: "pack-a", constraint: "^1.0.0" }],
      };

      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      const resolved = Option.getOrThrow(result);
      // Pack constraint ^1.0.0 limits to 1.x range, newest is 1.3.0
      expect(resolved.resolvedVersion).toBe("1.3.0");
      expect(resolved.warnings).toHaveLength(0);
    });

    it("applies pack constraints when user has no constraint (None)", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.none(),
        packConstraints: [{ packName: "pack-a", constraint: "^1.2.0" }],
      };

      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      const resolved = Option.getOrThrow(result);
      // ^1.2.0 matches 1.2.0, 1.3.0; newest is 1.3.0
      expect(resolved.resolvedVersion).toBe("1.3.0");
    });

    it("uses newest version when no constraints at all", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.none(),
        packConstraints: [],
      };

      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result).resolvedVersion).toBe("2.0.0");
    });
  });

  // ---------------------------------------------------------------------------
  // 7.2: Multi-constraint resolution
  // ---------------------------------------------------------------------------

  describe("multi-constraint resolution", () => {
    it("intersects compatible pack constraints", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("*"),
        packConstraints: [
          { packName: "pack-a", constraint: "^1.0.0" },
          { packName: "pack-b", constraint: "^1.2.0" },
        ],
      };

      // ^1.0.0 matches 1.0-1.x, ^1.2.0 matches 1.2-1.x
      // Intersection: 1.2.0, 1.3.0 — newest first → 1.3.0
      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      const resolved = Option.getOrThrow(result);
      expect(resolved.resolvedVersion).toBe("1.3.0");
      expect(resolved.warnings).toHaveLength(0);
    });

    it("uses newest with warning when pack constraints are incompatible", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("*"),
        packConstraints: [
          { packName: "pack-a", constraint: "^1.0.0" },
          { packName: "pack-b", constraint: "^2.0.0" },
        ],
      };

      // ^1.0.0 and ^2.0.0 have no overlap. No version satisfies both.
      // Falls back to newest (2.0.0), warns about pack-a whose ^1.0.0 is not satisfied
      const result = resolveConstrainedVersion(versions, constraints, "my-skill");

      expect(Option.isSome(result)).toBe(true);
      const resolved = Option.getOrThrow(result);
      expect(resolved.resolvedVersion).toBe("2.0.0");
      expect(resolved.warnings).toHaveLength(1);
      expect(resolved.warnings[0]).toContain("pack-a");
      expect(resolved.warnings[0]).toContain("^1.0.0");
    });

    it("returns none when no versions available", () => {
      const constraints: SkillConstraints = {
        userConstraint: Option.some("^1.0.0"),
        packConstraints: [],
      };

      const result = resolveConstrainedVersion([], constraints, "my-skill");

      expect(Option.isNone(result)).toBe(true);
    });
  });
});

// -----------------------------------------------------------------------------
// 7.3: Holdback warnings
// -----------------------------------------------------------------------------

describe("detectHoldbackWarnings", () => {
  it("warns when pack holds back user's latest-intent skill", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.some("*"),
      packConstraints: [{ packName: "frontend-pack", constraint: "^1.0.0" }],
    };

    const warnings = detectHoldbackWarnings("2.0.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("@acme/code-review");
    expect(warnings[0]).toContain("1.3.0");
    expect(warnings[0]).toContain("frontend-pack");
    expect(warnings[0]).toContain("^1.0.0");
    expect(warnings[0]).toContain("2.0.0");
  });

  it("no warning for pack-only skills (not user wildcard)", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.some("^1.0.0"),
      packConstraints: [{ packName: "frontend-pack", constraint: "^1.0.0" }],
    };

    const warnings = detectHoldbackWarnings("2.0.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(0);
  });

  it("no warning when resolved to latest", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.some("*"),
      packConstraints: [{ packName: "frontend-pack", constraint: "^1.0.0" }],
    };

    const warnings = detectHoldbackWarnings("1.3.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(0);
  });

  it("no warning when user has explicit constraint", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.some("^1.0.0"),
      packConstraints: [{ packName: "frontend-pack", constraint: "^1.0.0" }],
    };

    const warnings = detectHoldbackWarnings("2.0.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(0);
  });

  it("no warning when no pack constraints", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.some("*"),
      packConstraints: [],
    };

    const warnings = detectHoldbackWarnings("2.0.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(0);
  });

  it("warns only about constraining packs, not all packs", () => {
    const constraints: SkillConstraints = {
      userConstraint: Option.none(),
      packConstraints: [
        { packName: "pack-a", constraint: "^1.0.0" },
        { packName: "pack-b", constraint: ">=1.0.0" },
      ],
    };

    // pack-a ^1.0.0 doesn't satisfy 2.0.0, pack-b >=1.0.0 does
    const warnings = detectHoldbackWarnings("2.0.0", "1.3.0", constraints, "@acme/code-review");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pack-a");
    expect(warnings[0]).not.toContain("pack-b");
  });
});
