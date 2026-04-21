/**
 * Unit tests for `skill/skill-md-present`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { skillMdPresentRule } from "./skill-md-present.js";

const makeAccessor = (present: boolean): SkillFileAccessor => ({
  exists: (path) => Effect.succeed(path === "SKILL.md" && present),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
});

const makeContext = (present: boolean): SkillRuleContext => ({
  subject: { isNative: false, skillJson: undefined },
  files: makeAccessor(present),
  displayRoot: "",
});

describe("skill/skill-md-present", () => {
  it.effect("produces zero findings when SKILL.md is present", () =>
    Effect.gen(function* () {
      const findings = yield* skillMdPresentRule.check(makeContext(true));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces exactly one error finding when SKILL.md is missing", () =>
    Effect.gen(function* () {
      const findings = yield* skillMdPresentRule.check(makeContext(false));
      expect(findings).toHaveLength(1);
      const [finding] = findings;
      expect(finding?.kind).toBe("advisory");
      expect(finding?.ruleId).toBe("skill/skill-md-present");
      expect(finding?.severity).toBe("error");
      expect(finding?.location).toEqual({ file: "SKILL.md" });
      expect(finding?.message.length).toBeGreaterThan(0);
      expect(finding?.suggestions).toHaveLength(1);
    }),
  );
});
