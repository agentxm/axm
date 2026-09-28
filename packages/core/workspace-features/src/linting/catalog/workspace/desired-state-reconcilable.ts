import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  formatConstraintContributors,
  packManifestContentMismatchText,
  packManifestInvalidText,
  packManifestUnavailableText,
} from "@agentxm/workspace-kernel/workspace-state";
import { canonicalObservationFactText } from "@agentxm/workspace-kernel/projection";
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
      // Each finding carries the evaluation's own reason; it infers none.
      const packFinding = (pack: string, observed: string): AdvisoryFinding => ({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message: `Pack '${pack}' does not currently form a reconcilable desired-state route.${observed}`,
        location: { file: "axm.json" },
      });
      const extensionFinding = (message: string): AdvisoryFinding => ({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "error",
        message,
        location: { file: "axm.json" },
      });
      const graphFindings = graph.success.problems.map((problem): AdvisoryFinding => {
        switch (problem.type) {
          case "pack-manifest-content-mismatch":
            return packFinding(problem.pack, ` ${packManifestContentMismatchText(problem)}.`);
          case "pack-manifest-unavailable":
            return packFinding(problem.pack, ` The ${packManifestUnavailableText(problem)}.`);
          case "pack-manifest-invalid":
            return packFinding(problem.pack, ` The ${packManifestInvalidText(problem)}.`);
          case "pack-identity-mismatch":
          case "pack-resolution-unavailable":
            return packFinding(problem.pack, "");
          case "workspace-owner-missing":
            return extensionFinding(
              `${problem.extensionType} '${problem.name}' uses source 'workspace', but axm.json does not declare an owner.`,
            );
          case "member-configuration-unbound":
            return extensionFinding(
              `${problem.extensionType} '${problem.name}' is configured in ${problem.location}, but no configured pack supplies it. Remove the entry, or declare a source to install it directly.`,
            );
          case "projection-collision":
            return extensionFinding(
              `${problem.extensionType} '${problem.name}' has competing desired identities: ${problem.identities.join(", ")}.`,
            );
          case "constraint-conflict":
            return extensionFinding(
              `${problem.extensionType} '${problem.name}' has incompatible constraints: ${formatConstraintContributors(problem.contributors)}. Decision=blocked; reason=no-satisfying-version.`,
            );
        }
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
