import * as Effect from "effect/Effect";
import {
  projectionFactIsViolation,
  type ProjectionInvariantFact,
} from "../../../projection/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/projections-current";

/**
 * Managed output units render their complete contributor sets and content.
 *
 * Evidence is read back from the outputs themselves: an extension whose
 * canonical content is installed and reachable can still be absent from, or
 * stale in, its projection. The accessor yields no verdict when currency
 * cannot be judged (incomplete desired-state graph, missing canonical
 * content); root-cause rules own those conditions.
 */
export const projectionsCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed outputs render every enabled reachable contributor exactly once.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.projections === undefined) return EMPTY_LINT_FINDINGS;
      return findingsForProjectionFacts(yield* context.projections.facts);
    }),
};

const contributorSuffix = (fact: ProjectionInvariantFact): string =>
  fact.affectedContributors.length === 0
    ? ""
    : ` Affected contributors: ${fact.affectedContributors.join(", ")}.`;

export const findingsForProjectionFacts = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): ReadonlyArray<LintFinding> =>
  facts.filter(projectionFactIsViolation).map((fact) => ({
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "error",
    message:
      fact.observation.message ??
      `The AXM-owned projection at ${fact.subject.path} is ${fact.observation.status}.${contributorSuffix(fact)}`,
  }));
