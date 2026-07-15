/** Validate capability-targeting structure without blocking local imports. */

import * as Effect from "effect/Effect";

import { renderCapabilityTargetedMarkdown } from "../../../capability-targeting/render.js";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule, Severity } from "../../rule.js";

const RULE_ID = "skill/capability-targeting-structural";
const SKILL_MD = "SKILL.md";
const decoder = new TextDecoder();

const toFinding = (severity: Severity, message: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity,
  message,
  location: { file: SKILL_MD },
});

/** Create the local-warning or publish-error form of the structural rule. */
export const makeCapabilityTargetingStructuralRule = (
  severity: Severity,
): AdvisoryRule<SkillRuleContext> => ({
  id: RULE_ID,
  description:
    "Capability-targeting directives are structurally valid and the zero-capability render has no holes.",
  kind: "advisory",
  severity,
  check: (context) =>
    Effect.gen(function* () {
      if (!(yield* context.files.exists(SKILL_MD))) return [];
      const bytes = yield* context.files.readBytes(SKILL_MD).pipe(Effect.option);
      if (bytes._tag === "None") return [];
      const rendered = renderCapabilityTargetedMarkdown(decoder.decode(bytes.value), {
        agentId: "universal",
        inheritedAgentIds: [],
        capabilities: {},
        tokens: {},
      });
      return rendered.findings
        .filter((item) => item.structural || item.code === "unresolved-token")
        .map((item) =>
          toFinding(
            severity,
            item.code === "unresolved-token"
              ? `${item.message}. Baseline tokens require inline fallback text.`
              : item.message,
          ),
        );
    }),
});

/** Local lint is fail-open: structural targeting findings are warnings. */
export const capabilityTargetingStructuralRule = makeCapabilityTargetingStructuralRule("warning");
