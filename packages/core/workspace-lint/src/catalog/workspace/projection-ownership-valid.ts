import * as Effect from "effect/Effect";
import {
  projectionFactHasInvalidOwnership,
  type ProjectionInvariantFact,
} from "@agentxm/extension-workspace";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/projection-ownership-valid";

/**
 * Formatting and body edits are not lint concerns for generated documents.
 * Report only ownership proof that AXM cannot safely interpret or replace.
 */
export const projectionOwnershipValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "AXM-managed projections carry valid, supported ownership proof.",
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
      fact.observation.message ??
      `The AXM ownership proof at ${fact.subject.path} is invalid or unsupported.`,
  }));
