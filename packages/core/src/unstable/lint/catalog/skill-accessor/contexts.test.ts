/**
 * Unit tests for `buildSkillRuleContexts`.
 *
 * Confirms `displayRoot` + `subject` flow through per installed skill and
 * that the function doesn't mutate its input. The underlying accessor is
 * passed through by reference — the caller owns construction.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillFileAccessor } from "../../context.js";
import {
  buildSkillRuleContexts,
  type InstalledSkillInfo,
  type SkillIndexView,
} from "./contexts.js";

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

describe("buildSkillRuleContexts", () => {
  it("returns one context per installed skill", () => {
    const otherAccessor: SkillFileAccessor = {
      exists: () => Effect.succeed(true),
      readBytes: (path) =>
        Effect.fail({
          _tag: "FileAccessError" as const,
          path,
          reason: "read-error" as const,
          message: "other",
        }),
    };
    const items: ReadonlyArray<InstalledSkillInfo> = [
      {
        isNative: true,
        skillJson: { owner: "@acme", type: "skill", name: "a", version: "0.1.0" },
        displayRoot: ".axm/extensions/@acme/skills/a/src",
        files: absentAccessor,
        packageFiles: otherAccessor,
      },
      {
        isNative: false,
        skillJson: undefined,
        displayRoot: ".axm/extensions/external/skills/b",
        files: absentAccessor,
        packageFiles: absentAccessor,
      },
    ];
    const index: SkillIndexView = { installedSkills: items };

    const contexts = buildSkillRuleContexts(index);
    expect(contexts).toHaveLength(2);

    expect(contexts[0]?.subject.isNative).toBe(true);
    expect(contexts[0]?.subject.skillJson).toEqual({
      owner: "@acme",
      type: "skill",
      name: "a",
      version: "0.1.0",
    });
    expect(contexts[0]?.displayRoot).toBe(".axm/extensions/@acme/skills/a/src");
    expect(contexts[0]?.files).toBe(absentAccessor);
    expect(contexts[0]?.packageFiles).toBe(otherAccessor);

    expect(contexts[1]?.subject.isNative).toBe(false);
    expect(contexts[1]?.subject.skillJson).toBeUndefined();
    expect(contexts[1]?.displayRoot).toBe(".axm/extensions/external/skills/b");
    expect(contexts[1]?.files).toBe(absentAccessor);
    expect(contexts[1]?.packageFiles).toBe(absentAccessor);
  });

  it("returns an empty array when the index has no installed skills", () => {
    expect(buildSkillRuleContexts({ installedSkills: [] })).toEqual([]);
  });
});
