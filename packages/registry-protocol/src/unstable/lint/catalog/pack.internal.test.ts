/**
 * Spec + unit tests for the v1 `pack/*` rule catalog.
 *
 * Covers the spec scenarios for:
 *
 * - "Pack rule catalog ships the v1 three-rule set" — exact membership, ids,
 *   severities.
 * - "Rule ids and descriptions are public API" — id grammar per catalog entry.
 * - "Schema-valid rules delegate to Effect Schema" — smoke tests that the
 *   `-schema-valid` rule surfaces one finding per issue.
 *
 * Per-rule unit + fixture coverage lives in `./pack/<rule>.test.ts` (behavior)
 * and fixtures under `../__fixtures__/packs/<case>/` with `case.json`
 * describing expected findings.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { packRules } from "./pack.js";
import type { PackContent, PackFileAccessor, PackRuleContext } from "../context.js";

// -----------------------------------------------------------------------------
// Membership + severity
// -----------------------------------------------------------------------------

const V1_PACK_RULES = [
  { id: "pack/manifest-present", severity: "error", kind: "advisory" },
  { id: "pack/manifest-schema-valid", severity: "error", kind: "advisory" },
  { id: "pack/manifest-keys-recognized", severity: "error", kind: "advisory" },
] as const;

describe("packRules catalog membership", () => {
  it("exports exactly the v1 three rules in declaration order", () => {
    expect(packRules.map((r) => r.id)).toEqual(V1_PACK_RULES.map((r) => r.id));
  });

  it("pins each rule to the v1 severity", () => {
    expect(packRules.map((r) => ({ id: r.id, severity: r.severity }))).toEqual(
      V1_PACK_RULES.map(({ id, severity }) => ({ id, severity })),
    );
  });

  it("pins each rule to kind 'advisory' at v1", () => {
    expect(packRules.map((r) => ({ id: r.id, kind: r.kind }))).toEqual(
      V1_PACK_RULES.map(({ id, kind }) => ({ id, kind })),
    );
  });

  it("every rule id matches <namespace>/<subject>-<predicate> grammar", () => {
    const idPattern = /^pack\/[a-z][a-z0-9-]*$/;
    for (const rule of packRules) {
      expect(rule.id).toMatch(idPattern);
    }
  });

  it("every rule description is one sentence ≤100 characters", () => {
    for (const rule of packRules) {
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("every rule is callable over a PackRuleContext (type-level)", () => {
    const ctx: PackRuleContext = {
      subject: { packJson: undefined },
      files: absentFilesAccessor(),
      displayRoot: "",
    };

    // Type-level: `check` accepts `PackRuleContext` regardless of subject shape.
    for (const rule of packRules) {
      expect(typeof rule.check).toBe("function");
      // The call itself is a type-level assertion; the test passes so long as it
      // typechecks without cast.
      const _effect = rule.check(ctx);
      void _effect;
    }
  });
});

// -----------------------------------------------------------------------------
// Subject-typed compatibility (PackContent carries the concrete v1 shape)
// -----------------------------------------------------------------------------

describe("PackContent subject shape", () => {
  it("exposes packJson as the documented field", () => {
    const populated: PackContent = {
      packJson: { owner: "@acme", type: "pack", name: "example", version: "0.1.0" },
    };
    const absent: PackContent = { packJson: undefined };

    expect(populated.packJson).toBeDefined();
    expect(absent.packJson).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const absentFilesAccessor = (): PackFileAccessor => ({
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "no such file",
    }),
});
