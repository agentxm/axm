import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  formatConstraintContributors,
  packManifestContentMismatchText,
} from "../../../desired-state/index.js";
import { canonicalObservationFactText } from "../../../projection/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { observationsReportedBy } from "./canonical-observation-findings.js";

const RULE_ID = "workspace/desired-state-reconcilable";

export const desiredStateReconcilableRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired-state declarations and observations are mutually reconcilable.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graph = yield* Effect.result(context.health.desiredState);
      if (Result.isFailure(graph)) return [];
      const graphFindings = graph.success.problems.map((problem): AdvisoryFinding => {
        if ("pack" in problem) {
          const observed =
            problem.type === "pack-manifest-content-mismatch"
              ? ` ${packManifestContentMismatchText(problem)}.`
              : "";
          return {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `Pack '${problem.pack}' does not currently form a reconcilable desired-state route.${observed}`,
            location: { file: "axm.json" },
          };
        }
        return {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            problem.type === "workspace-owner-missing"
              ? `${problem.extensionType} '${problem.name}' uses source 'workspace', but axm.json does not declare an owner.`
              : problem.type === "member-configuration-unbound"
                ? `${problem.extensionType} '${problem.name}' is configured in ${problem.location}, but no configured pack supplies it. Remove the entry, or declare a source to install it directly.`
                : problem.type === "projection-collision"
                  ? `${problem.extensionType} '${problem.name}' has competing desired identities: ${problem.identities.join(", ")}.`
                  : `${problem.extensionType} '${problem.name}' has incompatible constraints: ${formatConstraintContributors(problem.contributors)}. Decision=blocked; reason=no-satisfying-version.`,
          location: { file: "axm.json" },
        };
      });
      const observed = yield* observationsReportedBy(context, RULE_ID);
      const observationFindings = observed.map(({ desired, observation }): AdvisoryFinding => ({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message:
          observation.status === "constraint-mismatch"
            ? `${canonicalObservationFactText(desired, observation)}; decision=reconcilable.`
            : `${canonicalObservationFactText(desired, observation)}.`,
        location: { file: observation.path ?? "axm.json" },
      }));
      return [...graphFindings, ...observationFindings];
    }),
};
