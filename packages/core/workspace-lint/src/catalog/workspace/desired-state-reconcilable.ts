import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
} from "@agentxm/extension-workspace";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";

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
              ? ` Accepted version=${problem.acceptedVersion} content=${problem.acceptedContentIdentity}; observed status=${problem.status}${problem.observedVersion === undefined ? "" : ` version=${problem.observedVersion} content=${problem.observedContentIdentity}`}.`
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
              : problem.type === "projection-collision"
                ? `${problem.extensionType} '${problem.name}' has competing desired identities: ${problem.identities.join(", ")}.`
                : `${problem.extensionType} '${problem.name}' has incompatible constraints: ${problem.contributors
                    .map((contributor) =>
                      contributor.source === "pack"
                        ? `${contributor.dependingPack ?? "unknown Pack"} range=${contributor.range} location=${contributor.location}`
                        : `settings range=${contributor.range} location=${contributor.location}`,
                    )
                    .join(", ")}. Decision=blocked; reason=no-satisfying-version.`,
          location: { file: "axm.json" },
        };
      });
      if (context.health.canonicalObservations === undefined) return graphFindings;
      const observations = yield* Effect.result(context.health.canonicalObservations);
      if (Result.isFailure(observations)) return graphFindings;
      const observationFindings = observations.success.flatMap(
        ({ desired, observation }): ReadonlyArray<AdvisoryFinding> => {
          if (
            observation.status === "usable" ||
            observation.status === "not-applicable" ||
            observation.status === "missing"
          ) {
            return [];
          }
          const identity = desired.identity.replace(/^workspace:/, "");
          const label = `${observation.type} '${identity}'`;
          if (observation.status === "constraint-mismatch") {
            const blockedByConflict = graph.success.problems.some(
              (problem) =>
                problem.type === "constraint-conflict" &&
                problem.extensionType === desired.type &&
                problem.name === desired.name,
            );
            if (blockedByConflict) return [];
            const fact = makeExtensionConstraintInvariantFact(desired, observation);
            return [
              {
                kind: "advisory",
                ruleId: RULE_ID,
                severity: "error",
                message: `${extensionConstraintFactText(fact)}; decision=reconcilable.`,
                location: { file: observation.path ?? "axm.json" },
              },
            ];
          }
          if (
            observation.status === "locally-modified" &&
            desired.source !== undefined &&
            isWorkspaceSourceLocator(desired.source)
          ) {
            return [];
          }
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message:
                observation.status === "materialization-mismatch"
                  ? `${label} differs from its accepted materialized package-tree integrity.`
                  : `${label} has canonical state ${observation.status}.`,
              location: { file: observation.path ?? "axm.json" },
            },
          ];
        },
      );
      return [...graphFindings, ...observationFindings];
    }),
};
