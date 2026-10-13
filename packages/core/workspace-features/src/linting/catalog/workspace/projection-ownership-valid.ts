import * as Effect from "effect/Effect";
import {
  projectionFactHasInvalidOwnership,
  type ProjectionInvariantFact,
} from "@agentxm/workspace-kernel/projection";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/projection-ownership-valid";

/**
 * Formatting and body edits are not lint concerns for generated documents.
 * Report only region fences AXM cannot safely pair, so it cannot replace the
 * region: the kernel's message names the path, the region and the problem.
 */
export const projectionOwnershipValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Projection region fences are well formed.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.projections === undefined) return EMPTY_LINT_FINDINGS;
      return findingsForProjectionOwnership(yield* context.projections.facts);
    }),
};

export const findingsForProjectionOwnership = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): ReadonlyArray<LintFinding> =>
  facts.filter(projectionFactHasInvalidOwnership).map((fact) => ({
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "error",
    message:
      fact.observation.message ?? `The AXM region fences at ${fact.subject.path} are malformed.`,
  }));
