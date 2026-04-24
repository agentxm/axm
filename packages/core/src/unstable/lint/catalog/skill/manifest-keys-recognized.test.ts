/**
 * Unit tests for `skill/manifest-keys-recognized`.
 *
 * Emits one warning finding per unrecognized top-level key.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillContent, SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { manifestKeysRecognizedRule } from "./manifest-keys-recognized.js";

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
};

describe("skill/manifest-keys-recognized", () => {
  it.effect("produces zero findings when every key is recognized", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ isNative: true, skillJson: validManifest }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("emits one warning finding per unknown top-level key", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({
          isNative: true,
          skillJson: { ...validManifest, made_up: "x", another: 1 },
        }),
      );
      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.ruleId === "skill/manifest-keys-recognized")).toBe(true);
      expect(findings.every((f) => f.severity === "warning")).toBe(true);
      expect(findings.every((f) => f.location?.file === "skill.json")).toBe(true);
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("made_up"))).toBe(true);
      expect(messages.some((m) => m.includes("another"))).toBe(true);
    }),
  );

  it.effect("early-returns zero findings for non-native skills", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ isNative: false, skillJson: { owner: "foo", unknown: 1 } }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("early-returns zero findings when skill.json is absent", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ isNative: true, skillJson: undefined }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("ignores non-object skill.json", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ isNative: true, skillJson: "a string" }),
      );
      expect(findings).toEqual([]);
    }),
  );
});
