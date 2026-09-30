/**
 * Installing rules.
 *
 * The source grammar a rule request accepts, the discovery that turns it into
 * refs, and the closure each ref becomes — including who renders the shared
 * instructions region when more than one rule lands in the same operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import {
  WorkspaceLocation,
  SettingsReader,
  DesiredStateReader,
  desiredReachability,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { RuleManager } from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  forecastInstallChange,
  type InstallArtifactPresentation,
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

import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";

/** Rules the request selected. */
export interface RuleInstallIntent {
  /** All Rule sources selected by the enclosing configured install for native preflight. */
  readonly projectionRefs?: ReadonlyArray<RuleExtensionRef>;
  /** The enclosing install has resolved this complete proposed contributor graph. */
  readonly desiredGraph?: DesiredStateGraph;
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<RuleExtensionRef>>;
}

/** The closures a settled rule intent becomes. */
export const planRuleInstall: (
  intent: RuleInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | RuleManager
> = Effect.fn("InstallExtensions.planRules")(function* (intent: RuleInstallIntent) {
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  const ruleManager = yield* RuleManager;
  const priorGraph = yield* (yield* DesiredStateReader).graph().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: "Cannot establish prior rule desired state",
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
            desiredReachability(priorGraph, { type: "rule", name: ref.rule.name }).decision ===
            "not-reached",
        )
        .map(({ ref }) => ref.rule.name),
    ),
  };
  const prepared = yield* ruleManager
    .prepareProjection(intent.projectionRefs ?? intent.refs.map(({ ref }) => ref), nativeProjection)
    .pipe(
      Effect.flatMap(observeInstructionSurfacePlans),
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: "Native locations cannot realize the proposed rule content",
          cause,
        }),
      ),
    );
  // One rule renders the shared instructions region itself; several rules in
  // one operation defer it so the region is rendered once, from the complete
  // contributor set.
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const configuredAgents = yield* (yield* SettingsReader).configuredAgents.pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: "Cannot establish configured agents for Rule install planning",
        cause,
      }),
    ),
  );
  const memberSteps = yield* Effect.forEach(intent.refs, ({ ref, versionRange }) =>
    Effect.gen(function* () {
      const installedBefore = yield* ruleManager
        .isInstalled({
          target: { type: "rule", name: ref.rule.name },
        })
        .pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "internal",
              detail: `Rule install planning failed for ${ref.rule.name}`,
              cause,
            }),
          ),
        );
      const { nativeLocations, agentOutcomes } = plannedInstructionContributorObservation({
        type: ref.type,
        name: ref.rule.name,
        contributor: formatFqn({ owner: ref.owner, type: ref.type, name: ref.name }),
        observations: prepared,
        agentIds: configuredAgents,
        scope: location.scope,
      });
      const firstLocation = nativeLocations[0];
      return buildInstallOperation(ruleManager, {
        plannedArtifact: {
          path:
            firstLocation === undefined
              ? ref.rule.name
              : path.relative(location.baseDir, firstLocation.address.path),
          scope: location.scope,
          change: forecastInstallChange({ installedBefore }),
          nativeLocations,
          agentOutcomes,
        },
        toStepFailure: kernelFailureToStepFailure,
        ref,
        declaration: { name: ref.rule.name, versionRange },
        ...(deferProjections
          ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
          : {}),
        buildArtifact: ({ change }) =>
          Effect.gen(function* () {
            const materialization = yield* ruleManager.aggregateProjectionObservation;
            const targets = materialization.targets.map((target) => ({
              path: target.path,
              change,
              ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
            }));
            return {
              path: targets[0]?.path ?? ref.rule.name,
              scope: location.scope,
              agents: materialization.agents,
              ...(materialization.nativeLocations === undefined
                ? {}
                : { nativeLocations: materialization.nativeLocations }),
              ...(ref.refType === "registry" ? { version: ref.version } : {}),
              ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
            } satisfies InstallArtifactPresentation;
          }),
      });
    }),
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:rule:instructions-region",
            label: "rule projections",
            readiness: "ready",
            run: ruleManager
              .projectionPlans(nativeProjection)
              .pipe(Effect.flatMap(applyInstructionSurfacePlans))
              .pipe(
                Effect.mapError(kernelFailureToStepFailure),
                Effect.flatMap(() =>
                  ruleManager.aggregateProjectionObservation.pipe(
                    Effect.mapError(kernelFailureToStepFailure),
                  ),
                ),
                Effect.map((observation): JobStepResult => ({
                  result: "success",
                  message: "Rendered installed Rules from the complete contributor set",
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
    name: "Install rules",
    description: Option.some("Install rule"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "rule",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
