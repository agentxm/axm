import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { capabilityTargetingMetadataRule } from "./capability-targeting-metadata.js";

const encoder = new TextEncoder();

const contextFor = (enhances: ReadonlyArray<string>): SkillRuleContext => {
  const content = `---
name: review
description: Review changes
---
<axm-enhance when="subagents:permissioned">
Delegate.
</axm-enhance>
`;
  const accessor: SkillFileAccessor = {
    exists: (path) => Effect.succeed(path === "SKILL.md"),
    readBytes: () => Effect.succeed(encoder.encode(content)),
  };
  return {
    subject: {
      isNative: true,
      skillJson: { enhances },
    },
    files: accessor,
    packageFiles: accessor,
    displayRoot: "",
  };
};

describe("skill/capability-targeting-metadata", () => {
  it.effect("accepts metadata equal to the source condition union", () =>
    Effect.gen(function* () {
      const findings = yield* capabilityTargetingMetadataRule.check(
        contextFor(["subagents:permissioned"]),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("reports drift between enhances metadata and source conditions", () =>
    Effect.gen(function* () {
      const findings = yield* capabilityTargetingMetadataRule.check(contextFor(["subagents"]));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("subagents:permissioned");
    }),
  );
});
