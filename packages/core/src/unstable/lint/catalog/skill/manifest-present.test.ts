/**
 * Unit tests for `skill/manifest-present`.
 *
 * Early-return arm: `subject.isNative === false` produces zero findings
 * regardless of whether `skill.json` exists on disk.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { manifestPresentRule } from "./manifest-present.js";

const makeAccessor = (skillJsonPresent: boolean): SkillFileAccessor => ({
  exists: (path) => Effect.succeed(path === "skill.json" && skillJsonPresent),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
});

const emptyAccessor = (): SkillFileAccessor => ({
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
});

const makeContext = (isNative: boolean, skillJsonPresent: boolean): SkillRuleContext => ({
  subject: { isNative, skillJson: undefined },
  // `files` (content root) intentionally does NOT carry `skill.json`; the rule
  // reads through `packageFiles` (package root).
  files: emptyAccessor(),
  packageFiles: makeAccessor(skillJsonPresent),
  displayRoot: "",
});

describe("skill/manifest-present", () => {
  it.effect("early-returns zero findings for non-native skills", () =>
    Effect.gen(function* () {
      const findings = yield* manifestPresentRule.check(makeContext(false, false));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces zero findings when native skill has skill.json", () =>
    Effect.gen(function* () {
      const findings = yield* manifestPresentRule.check(makeContext(true, true));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces one error finding when native skill lacks skill.json", () =>
    Effect.gen(function* () {
      const findings = yield* manifestPresentRule.check(makeContext(true, false));
      expect(findings).toHaveLength(1);
      const [finding] = findings;
      expect(finding?.ruleId).toBe("skill/manifest-present");
      expect(finding?.severity).toBe("error");
      expect(finding?.location).toEqual({ file: "skill.json" });
    }),
  );
});
