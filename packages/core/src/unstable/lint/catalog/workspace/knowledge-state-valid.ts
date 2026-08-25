/** Reports invalid observed state for desired Knowledge bundles. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { canonicalDisplayRoot, settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/knowledge-state-valid";

export const knowledgeStateValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired Knowledge content has usable canonical state.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const [unmanaged, resolved] = yield* Effect.all([
        Effect.result(context.workspace.knowledge.unmanaged),
        Effect.result(context.workspace.knowledge.resolved),
      ]);
      const resolvedNames = Result.isFailure(resolved)
        ? new Set<string>()
        : new Set(Option.getOrElse(resolved.success, () => []).map(({ name }) => name));
      const unmanagedFindings = Result.isFailure(unmanaged)
        ? []
        : unmanaged.success.flatMap(({ key, actual }): ReadonlyArray<AdvisoryFinding> =>
            resolvedNames.has(key.name) ||
            !actual.contentRoot
              .replaceAll("\\", "/")
              .includes(
                context.subject.scope === "project" ? "/agent_extensions/" : "/.axm/extensions/",
              )
              ? []
              : [
                  {
                    kind: "advisory",
                    ruleId: RULE_ID,
                    severity: "error",
                    message: `Knowledge bundle '${key.name}' has canonical content without an accepted AXM ownership fact.`,
                    location: { file: canonicalDisplayRoot(context.subject.scope) },
                  },
                ],
          );
      if (context.health?.canonicalObservations === undefined) return unmanagedFindings;
      const observations = yield* Effect.result(context.health.canonicalObservations);
      if (Result.isFailure(observations)) return unmanagedFindings;
      const observedFindings = observations.success.flatMap(
        ({ desired, observation }): ReadonlyArray<AdvisoryFinding> => {
          if (
            desired.type !== "knowledge" ||
            observation.status === "usable" ||
            observation.status === "not-applicable" ||
            observation.status === "locally-modified"
          ) {
            return [];
          }
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message: `Knowledge bundle '${desired.name}' has canonical state ${observation.status}.`,
              location: {
                file: observation.path ?? settingsDisplayPath(context.subject.scope),
              },
            },
          ];
        },
      );
      return [...unmanagedFindings, ...observedFindings];
    }),
};
