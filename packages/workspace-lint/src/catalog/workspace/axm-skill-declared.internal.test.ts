import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "@agentxm/extension-workspace";
import { contextFor, validLockfile, validSettings } from "./conformance/test-helpers.js";
import { axmSkillDeclaredRule } from "./axm-skill-declared.js";

const compatible = evaluateAxmSkillCompatibility({
  cliVersion: "1.2.3",
  skill: {
    manifestVersion: "1.2.0",
    source: "@agentxm/skills/axm@1.2.0",
    metadata: {
      [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.2.0",
      [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.2.0 <1.3.0",
    },
  },
});

describe("workspace/axm-skill-declared", () => {
  it("pins the rule contract", () => {
    expect(axmSkillDeclaredRule).toMatchObject({
      id: "workspace/axm-skill-declared",
      kind: "advisory",
      severity: "info",
      description: "The workspace declares the official AXM skill.",
    });
  });

  it.effect("reports undeclared official skill intent as an informational fact", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
      expect(
        yield* axmSkillDeclaredRule.check({
          ...context,
          axmSkillCompatibility: Effect.succeed(Option.none()),
        }),
      ).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/axm-skill-declared",
          severity: "info",
          message:
            "This workspace does not declare the official AXM skill. Install it with `axm skills install @agentxm/skills/axm --bundled`.",
          location: { file: "axm.json" },
        },
      ]);
    }),
  );

  it.effect("emits nothing when the official skill is declared", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
      expect(
        yield* axmSkillDeclaredRule.check({
          ...context,
          axmSkillCompatibility: Effect.succeed(Option.some(compatible)),
        }),
      ).toEqual([]);
    }),
  );
});
