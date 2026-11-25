/**
 * The install closure shared by instruction-region contributors.
 *
 * Rules and Knowledge bundles both contribute to a shared instruction region:
 * each selected source becomes one member install step, and several sources in
 * one operation defer the region render to one trailing projection step.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  desiredReachability,
  type DesiredStateGraph,
} from "../workspace-state/index.js";
import type {
  ExtensionManagerFailure,
  InstallMaterialization,
  KnowledgeManager,
  ManagerRequirements,
  MaterializationObservation,
  NativeProjectionOptions,
  RuleManager,
  RuleManagerService,
} from "../materialization/index.js";
import {
  installRefused,
  operationPresentation,
  type JobStepResult,
  type OperationRefused,
  type Plan,
  type PlannedJobStep,
} from "../operations/index.js";
import {
  applyObservedInstructionSurfacePlans,
  captureAgentOutputAuthority,
  observeObservedInstructionSurfacePlans,
  plannedInstructionContributorObservation,
  type ObservedProjectionPlans,
} from "../projection/index.js";
import {
  buildInstallOperation,
  forecastInstallChange,
  type InstallArtifactPresentation,
  type InstallChange,
} from "./extensions/operations.js";
import { kernelFailureToStepFailure } from "./failure-rendering.js";
import type { InstallStepRequirements, ResolvedInstallRef } from "./install-vocabulary.js";
import { projectionExposureRefs } from "./projection-exposure.js";

type ManagerObservedPlans = ObservedProjectionPlans<ExtensionManagerFailure, ManagerRequirements>;

/** The manager members an instruction-region contributor's install closure drives. */
type InstructionContributorManager<
  TRef extends RuleExtensionRef | KnowledgeExtensionRef,
  TFacts,
> = InstallMaterialization<TRef, TFacts, ExtensionManagerFailure, ManagerRequirements> &
  Pick<RuleManagerService, "aggregateProjectionObservation" | "observedProjectionPlans"> & {
    // Mirrors materialization/managers.ts ObservedPrepareProjectionCall<TRef, ManagerObservedProjectionPlans>.
    readonly observedPrepareProjection: <A, E, R>(
      refs: ReadonlyArray<TRef>,
      options: NativeProjectionOptions | undefined,
      use: (prepared: ManagerObservedPlans) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, ExtensionManagerFailure | E, ManagerRequirements | R>;
  };

/** One instruction-region contributor kind's install request and its wording. */
interface InstructionContributorInstall<
  TRef extends RuleExtensionRef | KnowledgeExtensionRef,
  TFacts,
> {
  readonly intent: {
    readonly projectionRefs?: ReadonlyArray<TRef>;
    readonly desiredGraph?: DesiredStateGraph;
    readonly deferProjections?: boolean;
    readonly refs: ReadonlyArray<ResolvedInstallRef<TRef>>;
  };
  readonly type: "rule" | "knowledge";
  readonly manager: InstructionContributorManager<TRef, TFacts>;
  readonly nameOf: (ref: TRef) => string;
  readonly wording: {
    readonly priorDesiredState: string;
    readonly prepareConflict: string;
    readonly exposureConflict: string;
    readonly configuredAgents: string;
    readonly memberPlanningFailed: (name: string) => string;
  };
  readonly memberMessage?: (name: string) => string;
  readonly buildArtifact: (args: {
    readonly ref: TRef;
    readonly change: InstallChange;
    readonly observation: MaterializationObservation;
    readonly scope: "project" | "user";
  }) => InstallArtifactPresentation;
  readonly projectionStep: {
    readonly key: string;
    readonly label: string;
    readonly message: string;
  };
  readonly plan: {
    readonly name: string;
    readonly description: string;
  };
}

/** The closures a settled instruction-region contributor intent becomes. */
export const planInstructionContributorInstall = <
  TRef extends RuleExtensionRef | KnowledgeExtensionRef,
  TFacts,
>(
  args: InstructionContributorInstall<TRef, TFacts>,
): Effect.Effect<
  Plan<InstallStepRequirements>,
  OperationRefused,
  InstallStepRequirements | RuleManager | KnowledgeManager
> =>
  Effect.gen(function* () {
    const { intent, manager, nameOf, wording } = args;
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const priorGraph = yield* (yield* DesiredStateReader).graph().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: wording.priorDesiredState,
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
              desiredReachability(priorGraph, { type: args.type, name: nameOf(ref) }).decision ===
              "not-reached",
          )
          .map(({ ref }) => nameOf(ref)),
      ),
    };
    const prepared = yield* manager
      .observedPrepareProjection(
        intent.projectionRefs ?? intent.refs.map(({ ref }) => ref),
        nativeProjection,
        observeObservedInstructionSurfacePlans,
      )
      .pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "conflict",
            detail: wording.prepareConflict,
            cause,
          }),
        ),
      );
    const exposureRefs = yield* projectionExposureRefs({
      observations: prepared,
      graph: intent.desiredGraph ?? priorGraph,
      proposedRefs: intent.projectionRefs ?? intent.refs.map(({ ref }) => ref),
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: wording.exposureConflict,
          cause,
        }),
      ),
    );
    // One contributor renders the shared region itself; several contributors
    // in one operation defer it so the region is rendered once, from the
    // complete contributor set.
    const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
    const configuredAgents = yield* (yield* SettingsReader).configuredAgents.pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: wording.configuredAgents,
          cause,
        }),
      ),
    );
    const memberSteps = yield* Effect.forEach(intent.refs, ({ ref, versionRange }) =>
      Effect.gen(function* () {
        const name = nameOf(ref);
        const installedBefore = yield* manager
          .isInstalled({
            target: { type: args.type, name },
          })
          .pipe(
            Effect.mapError((cause) =>
              installRefused({
                category: "internal",
                detail: wording.memberPlanningFailed(name),
                cause,
              }),
            ),
          );
        const { nativeLocations, agentOutcomes } = plannedInstructionContributorObservation({
          type: ref.type,
          name,
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
                ? name
                : path.relative(location.baseDir, firstLocation.address.path),
            scope: location.scope,
            change: forecastInstallChange({ installedBefore }),
            nativeLocations,
            agentOutcomes,
          },
          toStepFailure: kernelFailureToStepFailure,
          ref,
          projectionExposureRefs: exposureRefs,
          declaration: { name, versionRange },
          ...(deferProjections
            ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
            : {}),
          ...(args.memberMessage === undefined ? {} : { message: args.memberMessage(name) }),
          buildArtifact: ({ change }) =>
            Effect.map(manager.aggregateProjectionObservation, (observation) =>
              args.buildArtifact({ ref, change, observation, scope: location.scope }),
            ),
        });
      }),
    );
    const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
      deferProjections && intent.deferProjections !== true
        ? [
            {
              key: args.projectionStep.key,
              label: args.projectionStep.label,
              readiness: "ready",
              exposureRefs,
              run: manager
                .observedProjectionPlans(nativeProjection, applyObservedInstructionSurfacePlans)
                .pipe(
                  Effect.mapError(kernelFailureToStepFailure),
                  Effect.flatMap(() =>
                    manager.aggregateProjectionObservation.pipe(
                      Effect.mapError(kernelFailureToStepFailure),
                    ),
                  ),
                  Effect.map((observation): JobStepResult => ({
                    result: "success",
                    message: args.projectionStep.message,
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
      name: args.plan.name,
      description: Option.some(args.plan.description),
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        args.type,
      ),
      jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
    } satisfies Plan<InstallStepRequirements>;
  });
