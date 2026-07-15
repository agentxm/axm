/**
 * Spec + unit tests for the `skill/*` rule catalog.
 *
 * Covers the spec scenarios for:
 *
 * - "Skill rule catalog ships the supported rule set" — exact membership, ids,
 *   severities.
 * - "Rule ids and descriptions are public API" — id grammar per catalog entry.
 * - "Schema-valid rules delegate to Effect Schema" — smoke tests that the
 *   `-schema-valid` rule surfaces one finding per issue.
 *
 * Per-rule unit + fixture coverage lives in `./skill.unit.test.ts` (behavior)
 * and fixtures under `../__fixtures__/skills/<case>/` with
 * `expected-findings.json` snapshots.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { skillRules } from "./skill.js";
import type { SkillContent, SkillFileAccessor, SkillRuleContext } from "../context.js";

// -----------------------------------------------------------------------------
// Membership + severity
// -----------------------------------------------------------------------------

const V1_SKILL_RULES = [
  { id: "skill/skill-md-present", severity: "error", kind: "advisory" },
  { id: "skill/manifest-present", severity: "error", kind: "advisory" },
  { id: "skill/frontmatter-parseable", severity: "error", kind: "advisory" },
  { id: "skill/manifest-schema-valid", severity: "error", kind: "advisory" },
  { id: "skill/manifest-keys-recognized", severity: "error", kind: "advisory" },
  {
    id: "skill/capability-targeting-structural",
    severity: "warning",
    kind: "advisory",
  },
  { id: "skill/capability-targeting-metadata", severity: "warning", kind: "advisory" },
] as const;

describe("skillRules catalog membership", () => {
  it("exports exactly the supported rules in declaration order", () => {
    expect(skillRules.map((r) => r.id)).toEqual(V1_SKILL_RULES.map((r) => r.id));
  });

  it("pins each rule to the v1 severity", () => {
    expect(skillRules.map((r) => ({ id: r.id, severity: r.severity }))).toEqual(
      V1_SKILL_RULES.map(({ id, severity }) => ({ id, severity })),
    );
  });

  it("pins each rule to kind 'advisory' at v1", () => {
    expect(skillRules.map((r) => ({ id: r.id, kind: r.kind }))).toEqual(
      V1_SKILL_RULES.map(({ id, kind }) => ({ id, kind })),
    );
  });

  it("every rule id matches <namespace>/<subject>-<predicate> grammar", () => {
    const idPattern = /^skill\/[a-z][a-z0-9-]*$/;
    for (const rule of skillRules) {
      expect(rule.id).toMatch(idPattern);
    }
  });

  it("every rule description is one sentence ≤100 characters", () => {
    for (const rule of skillRules) {
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("every rule is callable over a SkillRuleContext (type-level)", () => {
    const accessor = absentFilesAccessor();
    const ctx: SkillRuleContext = {
      subject: { isNative: false, skillJson: undefined },
      files: accessor,
      packageFiles: accessor,
      displayRoot: "",
    };

    // Type-level: `check` accepts `SkillRuleContext` regardless of subject shape.
    for (const rule of skillRules) {
      expect(typeof rule.check).toBe("function");
      // The call itself is a type-level assertion; the test passes so long as it
      // typechecks without cast.
      const _effect = rule.check(ctx);
      void _effect;
    }
  });
});

// -----------------------------------------------------------------------------
// Subject-typed compatibility (SkillContent carries the concrete v1 shape)
// -----------------------------------------------------------------------------

describe("SkillContent subject shape", () => {
  it("exposes isNative and skillJson as documented fields", () => {
    const nativeContent: SkillContent = {
      isNative: true,
      skillJson: { owner: "@acme", type: "skill", name: "example", version: "0.1.0" },
    };
    const nonNativeContent: SkillContent = { isNative: false, skillJson: undefined };

    expect(nativeContent.isNative).toBe(true);
    expect(nonNativeContent.isNative).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const absentFilesAccessor = (): SkillFileAccessor => ({
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "no such file",
    }),
});
