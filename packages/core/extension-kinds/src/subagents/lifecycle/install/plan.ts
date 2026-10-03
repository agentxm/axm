/**
 * Installing subagents.
 *
 * A subagent renders its selected implementation for each compatible
 * configured target and reports unsupported targets explicitly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
} from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  kernelFailureToStepFailure,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import { DesiredStateReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";

import { prepareSubagentInstallations } from "../application/installation.js";
import { subagentInstallationFacts } from "../adapters/installation.js";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

/** Subagents the request selected, and whether to re-materialize regardless. */
export interface SubagentInstallIntent {
  readonly subagentsToInstall: ReadonlyArray<ResolvedInstallRef<SubagentExtensionRef>>;
  readonly force?: boolean;
}

/** The closures a settled subagent intent becomes. */
export const planSubagentInstall: (
  intent: SubagentInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SubagentManager
> = Effect.fn("InstallExtensions.planSubagents")(function* (intent: SubagentInstallIntent) {
  const subagentManager = yield* SubagentManager;
  const location = yield* WorkspaceLocation;
  const prior = yield* (yield* DesiredStateReader).graph().pipe(
    Effect.mapError((cause) => {
      const failure = kernelFailureToStepFailure(cause);
      return installRefused({ category: failure.category, detail: failure.detail, cause });
    }),
  );
  const prepared = yield* prepareSubagentInstallations(
    subagentInstallationFacts,
    intent.subagentsToInstall,
  );
  const steps = yield* Effect.forEach(prepared, (entry) =>
    Effect.gen(function* () {
      const enabled =
        prior.nodes.find(
          (node) => node.type === "subagent" && node.name === entry.ref.subagent.name,
        )?.enabled !== false;
      const outcomes = yield* subagentManager
        .configuredAgentOutcomesForRef(entry.ref, "projected", { validateDestinations: enabled })
        .pipe(
          Effect.mapError((cause) => {
            const failure = kernelFailureToStepFailure(cause);
            return installRefused({ category: failure.category, detail: failure.detail, cause });
          }),
        );
      const step = buildInstallOperation(
        enabled
          ? subagentManager
          : { ...subagentManager, materializeInstall: subagentManager.acquireCanonical },
        {
          toStepFailure: kernelFailureToStepFailure,
          ref: entry.ref,
          declaration: { name: entry.ref.subagent.name, versionRange: entry.versionRange },
          force: intent.force === true,
          plannedArtifact: {
            path: entry.ref.subagent.name,
            scope: location.scope,
            change: "updated",
            agentOutcomes: outcomes,
          },
          buildArtifact: ({ change, materialization }) =>
            Effect.succeed(
              entry.buildArtifact({
                change,
                observation: Option.match(materialization, {
                  onNone: () => NO_MATERIALIZATION_OBSERVATION,
                  onSome: (facts) => facts.observation,
                }),
              }),
            ),
        },
      );
      if (
        enabled &&
        outcomes.length > 0 &&
        !outcomes.some(
          (outcome) => outcome.outcome === "projected" || outcome.outcome === "current",
        )
      ) {
        return {
          ...step,
          readiness: "error",
          errorMessage: `No configured runtime can realize subagent ${entry.ref.subagent.name}: ${outcomes.map((outcome) => `${outcome.agentId}: ${outcome.reason}`).join("; ")}`,
          agentOutcomes: outcomes,
        } satisfies PlannedJobStep<InstallStepRequirements>;
      }
      return { ...step, agentOutcomes: outcomes };
    }),
  );

  return {
    _tag: "Plan",
    name: intent.subagentsToInstall.length === 1 ? "Install subagent" : "Install subagents",
    description: Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "subagent",
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
