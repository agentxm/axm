import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { skillRules as publishSkillRules } from "../../publish.js";
import {
  capabilityTargetingStructuralRule,
  makeCapabilityTargetingStructuralRule,
} from "./capability-targeting-structural.js";

const encoder = new TextEncoder();

const contextFor = (content: string): SkillRuleContext => {
  const accessor: SkillFileAccessor = {
    exists: (path) => Effect.succeed(path === "SKILL.md"),
    readBytes: () => Effect.succeed(encoder.encode(content)),
  };
  return {
    subject: { isNative: false, skillJson: undefined },
    files: accessor,
    packageFiles: accessor,
    displayRoot: "",
  };
};

const malformed = `---
name: review
description: Review changes
---
<axm-variants>
<axm-variant when="subagents">
Delegate.
</axm-variant>
</axm-variants>
`;

describe("skill/capability-targeting-structural", () => {
  it.effect("reports structural DSL failures as local warnings", () =>
    Effect.gen(function* () {
      const findings = yield* capabilityTargetingStructuralRule.check(contextFor(malformed));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("warning");
      expect(findings[0]?.message).toMatch(/default/i);
    }),
  );

  it.effect("promotes the same structural failure to an error for publish", () =>
    Effect.gen(function* () {
      const rule = publishSkillRules.find(
        (candidate) => candidate.id === "skill/capability-targeting-structural",
      );
      if (rule === undefined) throw new Error("publish structural rule is missing");

      const findings = yield* rule.check(contextFor(malformed));
      expect(findings[0]?.severity).toBe("error");
    }),
  );

  it.effect("treats an unresolved baseline token as structural at publish", () =>
    Effect.gen(function* () {
      const rule = makeCapabilityTargetingStructuralRule("error");
      const findings = yield* rule.check(
        contextFor(`---
name: review
description: Review changes
---
Use {{do:ask-structured}}.
`),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("error");
      expect(findings[0]?.message).toMatch(/fallback/i);
    }),
  );
});
