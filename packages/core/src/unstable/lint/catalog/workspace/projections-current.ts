import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/projections-current";

/**
 * Aggregate managed output units render their complete contributor sets.
 *
 * Evidence is read back from the outputs themselves: an extension whose
 * canonical content is installed and reachable can still be absent from, or
 * stale in, its projection. The accessor yields no verdict when currency
 * cannot be judged (incomplete desired-state graph, missing canonical
 * content); root-cause rules own those conditions.
 */
export const projectionsCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Aggregate managed outputs render every enabled reachable contributor exactly once.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.projections === undefined) return EMPTY_LINT_FINDINGS;
      const rulesRegion = yield* context.projections.rulesRegionCurrent;
      const hooks = yield* context.projections.hooksProjectionsCurrent;
      const findings: Array<LintFinding> = [];
      if (Option.isSome(rulesRegion) && !rulesRegion.value) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "The managed Rules region does not render every enabled reachable rule exactly once.",
        });
      }
      if (Option.isSome(hooks) && !hooks.value) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "The managed hook entries or fallback region do not render every enabled reachable hook exactly once.",
        });
      }
      return findings;
    }),
};
