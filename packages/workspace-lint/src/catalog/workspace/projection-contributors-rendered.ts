import * as Effect from "effect/Effect";
import {
  formatProjectionExclusion,
  type ProjectionInvariantFact,
} from "@agentxm/extension-workspace";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/projection-contributors-rendered";

/**
 * A generated file that omits a desired contributor is still written, so no
 * command fails on it. This rule is the durable reminder: it reports each
 * omission, and why, until the package is fixed or removed.
 */
export const projectionContributorsRenderedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Every desired contributor reaches the AXM-managed file it belongs in.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.projections === undefined) return EMPTY_LINT_FINDINGS;
      return findingsForProjectionExclusions(yield* context.projections.facts);
    }),
};

export const findingsForProjectionExclusions = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): ReadonlyArray<LintFinding> =>
  facts.flatMap((fact) =>
    (fact.observation.exclusions ?? []).map((exclusion) => ({
      kind: "advisory" as const,
      ruleId: RULE_ID,
      severity: "warning" as const,
      message: formatProjectionExclusion({
        exclusion,
        targetFile: fact.subject.path.split("#", 1)[0] ?? fact.subject.path,
      }),
    })),
  );
