/**
 * Unit tests for `skill/manifest-schema-valid`.
 *
 * Delegates to `Schema.decodeUnknownResult(SkillManifestSchema)` with
 * `onExcessProperty: "ignore"` and `errors: "all"`. Tests cover:
 *
 * - Happy path: fully valid manifest.
 * - Required-field missing (`version`).
 * - Bad `version` (not SemVer).
 * - Bad `owner` (not a handle).
 * - Bad `name` (uppercase).
 * - Excess keys are ignored at this rule (keys-recognized owns them).
 * - Non-native skill with no manifest: zero findings.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillContent, SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { manifestSchemaValidRule } from "./manifest-schema-valid.js";

const absentAccessor: SkillFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
};

const makeContext = (subject: SkillContent): SkillRuleContext => ({
  subject,
  files: absentAccessor,
  packageFiles: absentAccessor,
  displayRoot: "",
});

const validManifest = {
  owner: "@acme",
  type: "skill",
  name: "example",
  version: "0.1.0",
  description: "an example skill",
};

describe("skill/manifest-schema-valid", () => {
  it.effect("produces zero findings for a fully valid manifest", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: validManifest }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("early-returns zero findings for non-native skills", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: false, skillJson: undefined }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces zero findings when native manifest is absent", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: undefined }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("flags a missing required field", () =>
    Effect.gen(function* () {
      const { version: _omitted, ...without } = validManifest;
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: without }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.every((f) => f.ruleId === "skill/manifest-schema-valid")).toBe(true);
      expect(findings.every((f) => f.severity === "error")).toBe(true);
      expect(findings[0]?.location?.file).toBe("skill.json");
    }),
  );

  it.effect("flags an invalid SemVer version", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: { ...validManifest, version: "not-semver" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.severity).toBe("error");
    }),
  );

  it.effect("flags a bad owner handle", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: { ...validManifest, owner: "no-at-sign" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
    }),
  );

  it.effect("flags an invalid extension name", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: { ...validManifest, name: "UPPERCASE" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
    }),
  );

  it.effect("ignores excess top-level keys (keys-recognized owns them)", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ isNative: true, skillJson: { ...validManifest, unknown_field: "x" } }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("accumulates findings for multiple independent issues", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({
          isNative: true,
          skillJson: { ...validManifest, version: "bad", name: "UPPERCASE" },
        }),
      );
      // Expect at least two findings since `errors: "all"` accumulates.
      expect(findings.length).toBeGreaterThanOrEqual(2);
    }),
  );
});
