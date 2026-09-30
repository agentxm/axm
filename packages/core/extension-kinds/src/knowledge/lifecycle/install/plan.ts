import {
  WorkspaceLocation,
  SettingsReader,
  DesiredStateReader,
  desiredReachability,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
/**
 * Installing Open Knowledge Format bundles.
 *
 * A bundle becomes discoverable through the shared discovery region, so
 * several bundles in one operation defer that render until every contributor
 * has landed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { KnowledgeManager } from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  forecastInstallChange,
  kernelFailureToStepFailure,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  operationPresentation,
  installRefused,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
} from "@agentxm/workspace-kernel/operations";
import {
  applyInstructionSurfacePlans,
  captureAgentOutputAuthority,
  observeInstructionSurfacePlans,
  plannedInstructionContributorObservation,
} from "@agentxm/workspace-kernel/projection";

import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";

import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

/** Knowledge bundles the request selected. */
export interface KnowledgeInstallIntent {
  /** All Knowledge sources selected by the enclosing configured install for native preflight. */
  readonly projectionRefs?: ReadonlyArray<KnowledgeExtensionRef>;
  /** The enclosing install has resolved this complete proposed contributor graph. */
  readonly desiredGraph?: DesiredStateGraph;
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<KnowledgeExtensionRef>>;
}

/** The closures a settled knowledge intent becomes. */
export const planKnowledgeInstall: (
  intent: KnowledgeInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | KnowledgeManager
> = Effect.fn("InstallExtensions.planKnowledge")(function* (intent: KnowledgeInstallIntent) {
  const manager = yield* KnowledgeManager;
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  const priorGraph = yield* (yield* DesiredStateReader).graph().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: "Cannot establish prior knowledge desired state",
        cause,
      }),
    ),
  );
  const priorAuthority = yield* captureAgentOutputAuthority().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: "Cannot establish prior native ownership",
        cause,
      }),
    ),
  );
  const nativeProjection = {
    ...(intent.desiredGraph === undefined ? {} : { desiredGraph: intent.desiredGraph }),
    priorAuthority,
    nativeInsertionEligibleNames: new Set(
      intent.refs
        .filter(
          ({ ref }) =>
            desiredReachability(priorGraph, { type: "knowledge", name: ref.knowledge.name })
              .decision === "not-reached",
        )
        .map(({ ref }) => ref.knowledge.name),
    ),
  };
  const prepared = yield* manager
    .prepareProjection(intent.projectionRefs ?? intent.refs.map(({ ref }) => ref), nativeProjection)
    .pipe(
      Effect.flatMap(observeInstructionSurfacePlans),
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: "Native locations cannot realize the proposed knowledge content",
          cause,
        }),
      ),
    );
  // One bundle renders the shared discovery region itself; several bundles in
  // one operation defer it so the region is rendered once, from the complete
  // contributor set.
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const configuredAgents = yield* (yield* SettingsReader).configuredAgents.pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: "Cannot establish configured agents for Knowledge install planning",
        cause,
      }),
    ),
  );
  const memberSteps = yield* Effect.forEach(intent.refs, ({ ref, versionRange }) =>
    Effect.gen(function* () {
      const installedBefore = yield* manager
        .isInstalled({
          target: { type: "knowledge", name: ref.knowledge.name },
        })
        .pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "internal",
              detail: `Knowledge install planning failed for ${ref.knowledge.name}`,
              cause,
            }),
          ),
        );
      const { nativeLocations, agentOutcomes } = plannedInstructionContributorObservation({
        type: ref.type,
        name: ref.knowledge.name,
        contributor: formatFqn({ owner: ref.owner, type: ref.type, name: ref.name }),
        observations: prepared,
        agentIds: configuredAgents,
        scope: location.scope,
      });
      const firstLocation = nativeLocations[0];
      return buildInstallOperation(manager, {
        plannedArtifact: {
          path:
            firstLocation === undefined
              ? ref.knowledge.name
              : path.relative(location.baseDir, firstLocation.address.path),
          scope: location.scope,
          change: forecastInstallChange({ installedBefore }),
          nativeLocations,
          agentOutcomes,
        },
        toStepFailure: kernelFailureToStepFailure,
        ref,
        declaration: { name: ref.knowledge.name, versionRange },
        ...(deferProjections
          ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
          : {}),
        message: `Installed ${ref.knowledge.name}`,
        buildArtifact: ({ change }) =>
          Effect.map(manager.aggregateProjectionObservation, (observation) => ({
            path: observation.targets[0]?.path ?? ref.knowledge.name,
            scope: location.scope,
            agents: observation.agents,
            ...(observation.nativeLocations === undefined
              ? {}
              : { nativeLocations: observation.nativeLocations }),
            targets: observation.targets.map((target) => ({ ...target, change })),
          })),
      });
    }),
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:knowledge:discovery-region",
            label: "knowledge projection",
            readiness: "ready",
            run: manager
              .projectionPlans(nativeProjection)
              .pipe(Effect.flatMap(applyInstructionSurfacePlans))
              .pipe(
                Effect.mapError(kernelFailureToStepFailure),
                Effect.flatMap(() =>
                  manager.aggregateProjectionObservation.pipe(
                    Effect.mapError(kernelFailureToStepFailure),
                  ),
                ),
                Effect.map((observation): JobStepResult => ({
                  result: "success",
                  message: "Rendered installed Knowledge bundles from the complete contributor set",
                  artifact: {
                    path: observation.targets[0]?.path ?? "instruction files",
                    scope: location.scope,
                    change:
                      observation.nativeLocations?.some((location) =>
                        ["created", "updated", "removed"].includes(location.state),
                      ) === true
                        ? "updated"
                        : "unchanged",
                    ...(observation.nativeLocations === undefined
                      ? {}
                      : { nativeLocations: observation.nativeLocations }),
                  },
                })),
              ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install knowledge",
    description: Option.some("Install Open Knowledge Format bundle"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "knowledge",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
