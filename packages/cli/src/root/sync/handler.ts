/**
 * Handler for `axm sync`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import { makeAppError } from "../../app-error/index.js";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  observeUnit,
  previewOrApplyPlan,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-operations";
import { Screen } from "../../screen/index.js";
import {
  desiredStateProblemsText,
  WorkspaceMutations,
  type CanonicalObservationStatus,
  type DesiredExtensionNode,
} from "@agentxm/workspace-state";
import {
  LifecycleFailureAdapter,
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/extension-lifecycle";
import {
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { installMcpServer } from "@agentxm/extension-lifecycle";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { WorkspaceInvariantFacts } from "@agentxm/extension-workspace";
import {
  deriveOperationOutcome,
  StepFailure,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { buildConfiguredPackInstallPlan } from "../install/workspace-install.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { toAppError } from "../../app-error/conversions.js";
import {
  SYNC_PLAN_DESCRIPTION,
  SYNC_PLAN_NAME,
  SYNC_PRESENTATION,
  SYNC_RECOVERY_IDS,
  collectCleanupStep,
  collectHooksStep,
  collectInstructionStep,
  collectKnowledgeStep,
  makeSyncPlan,
} from "@agentxm/workspace-sync";
import {
  collectMaterializeSteps as collectSyncMaterializeSteps,
  normalizedIdentity,
  recoverableExternalPackName,
  scopedProblems,
  type ConfiguredPackRecovery,
  type SyncSelection,
} from "@agentxm/workspace-sync";
import {
  lifecycleFailureToAppError,
  syncFailureToAppError,
  syncStepFailureAdapter,
} from "../../feature-errors.js";

export interface HandleSyncArgs {
  readonly target?: Option.Option<string>;
  readonly type?: Option.Option<Exclude<ExtensionType, "pack">>;
  readonly preview: boolean;
  readonly failOnChange?: boolean;
}

export interface SyncTestHooks {
  readonly beforeMaterialization?: () => Effect.Effect<void, StepFailure>;
  readonly afterMaterialization?: (index: number) => Effect.Effect<void, StepFailure>;
}

type SyncPlanRequirements =
  | LifecycleFailureAdapter
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | Screen
  | CodingAgentRepository;
const collectConfiguredPackRecovery = Effect.fn("Sync.collectConfiguredPackRecovery")(
  function* (args: { readonly selection: SyncSelection }) {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
    const recoveryProblems = scopedProblems(graph, args.selection).filter(
      (problem) => recoverableExternalPackName(graph, problem) !== undefined,
    );
    const packNames = new Set(
      recoveryProblems.flatMap((problem) => {
        const name = recoverableExternalPackName(graph, problem);
        return name === undefined ? [] : [name];
      }),
    );
    if (packNames.size === 0) return undefined;
    const result = yield* buildConfiguredPackInstallPlan({
      planName: "Recover configured packs",
      planDescription: Option.some("Restore accepted Pack graphs from configured sources"),
      packNames,
    });
    if (result._tag === "NoConfiguredExtensions") return undefined;
    return {
      packNames,
      releaseAge: result.plan.releaseAge,
      steps: result.plan.jobs.flatMap((job) =>
        job.steps.map((step) => {
          const stepProblems = recoveryProblems.filter(
            (problem) =>
              "pack" in problem &&
              normalizedIdentity(problem.pack) === normalizedIdentity(step.label),
          );
          return {
            ...step,
            key: `${SYNC_RECOVERY_IDS.packManifestDivergence}:${step.key ?? step.label}`,
            label: `Recover ${step.label} (${desiredStateProblemsText(
              stepProblems.length === 0 ? recoveryProblems : stepProblems,
            )})`,
          };
        }),
      ),
    } satisfies ConfiguredPackRecovery;
  },
);
const resolveDesiredExtensionRef = (
  node: DesiredExtensionNode & { readonly source: string },
  canonicalStatus: CanonicalObservationStatus,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  constraintDetail?: string,
) => {
  const annotate = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError(lifecycleFailureToAppError),
      Effect.mapError((cause) =>
        makeAppError({
          code: constraintDetail === undefined ? cause.code : "conflict",
          detail:
            constraintDetail === undefined
              ? `${node.type} ${node.name}: ${cause.detail} (canonical status: ${canonicalStatus})`
              : `${constraintDetail}; decision=blocked; reason=no-satisfying-version; ${cause.detail}`,
          // Annotation adds the node and its canonical status; it must not
          // cost the operator the recovery the cause already named.
          ...(cause.suggestions === undefined ? {} : { suggestions: cause.suggestions }),
          cause,
        }),
      ),
    );
  switch (node.type) {
    case "skill":
      return annotate(resolveConfiguredSkill(node.name, node.source, releaseAgeEvaluation));
    case "mcp-server":
      return annotate(resolveConfiguredMcpServer(node.name, node.source, releaseAgeEvaluation));
    case "subagent":
      return annotate(resolveConfiguredSubagent(node.name, node.source, releaseAgeEvaluation));
    case "rule":
      return annotate(resolveConfiguredRule(node.name, node.source, releaseAgeEvaluation));
    case "hook":
      return annotate(resolveConfiguredHook(node.name, node.source, releaseAgeEvaluation));
    case "knowledge":
      return annotate(resolveConfiguredKnowledge(node.name, node.source, releaseAgeEvaluation));
    case "pack":
      return Effect.fail(
        makeAppError({
          code: "internal",
          detail: `Pack ${node.identity} is not a projection target`,
        }),
      );
  }
};

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* (args?: {
  readonly selection: SyncSelection;
  readonly retainedOnly?: boolean;
  /** Desired agent set for membership preflight before settings are committed. */
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly packRecovery?: ConfiguredPackRecovery<SyncPlanRequirements>;
}) {
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.mapError(lifecycleFailureToAppError),
  );
  return yield* collectSyncMaterializeSteps({
    ...(args?.selection === undefined ? {} : { selection: args.selection }),
    ...(args?.retainedOnly === undefined ? {} : { retainedOnly: args.retainedOnly }),
    ...(args?.configuredAgents === undefined ? {} : { configuredAgents: args.configuredAgents }),
    ...(args?.packRecovery === undefined ? {} : { packRecovery: args.packRecovery }),
    releaseAgeEvaluation,
    resolveDesiredRef: (node, canonicalStatus, constraintDetail) =>
      resolveDesiredExtensionRef(node, canonicalStatus, releaseAgeEvaluation, constraintDetail),
    runMcpServerInstall: ({ ref, force }) =>
      Effect.gen(function* () {
        return yield* installMcpServer({
          name: "install-mcp-server",
          args: {
            ref,
            nonInteractive: yield* isNonInteractiveOptional,
            force,
            allowWorkspaceSourceTransition: false,
            versionRange: Option.none(),
            skipSettings: Option.some(true),
          },
        });
      }),
    adapter: syncStepFailureAdapter,
  }).pipe(Effect.mapError(syncFailureToAppError));
});

export const handleSync = (args: HandleSyncArgs, hooks: SyncTestHooks = {}) =>
  withOperationLifecycle(
    {
      command: "sync",
      mode: args.preview === true ? "preview" : "apply",
      planName: "Sync workspace",
      presentation: SYNC_PRESENTATION,
    },
    handleSyncBody(args, hooks),
  );

const handleSyncBody = Effect.fn("Sync.handle")(function* (
  args: HandleSyncArgs,
  hooks: SyncTestHooks = {},
) {
  if (args.failOnChange === true && !args.preview) {
    return yield* makeAppError({
      code: "usage",
      detail: "--fail-on-change requires --preview",
      suggestions: [
        {
          description: "Run the read-only convergence assertion",
          cmd: "axm sync --preview --fail-on-change",
        },
      ],
    });
  }
  const ws = yield* WorkspaceMutations;
  const screen = yield* Screen;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const invariantFacts = yield* WorkspaceInvariantFacts;
  const syncPlanLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(Screen, screen),
    Layer.succeed(CodingAgentRepository, agentRepo),
  );
  const target = args.target ?? Option.none<string>();
  const type = args.type ?? Option.none<Exclude<ExtensionType, "pack">>();
  const selection = { target, type };
  const scoped = Option.isSome(target) || Option.isSome(type);
  const scopeLabel = Option.isSome(target)
    ? target.value
    : Option.isSome(type)
      ? `type ${type.value}`
      : "workspace";
  const planName = scoped ? `Sync ${scopeLabel}` : SYNC_PLAN_NAME;
  const planDescription = scoped
    ? `Scoped materialization for ${scopeLabel}`
    : SYNC_PLAN_DESCRIPTION;
  const upToDateMessage = scoped
    ? `${scopeLabel} materialization is up to date`
    : "Workspace materialization is up to date";
  const preflight = yield* observeUnit(
    { id: "sync-preflight", label: `${scopeLabel} sync plan` },
    Effect.gen(function* () {
      const packRecovery = yield* collectConfiguredPackRecovery({ selection });
      const {
        steps,
        cleanupSafe,
        knowledgeMayChange,
        serialMaterialization,
        expectedSkillNames,
        expectedSubagentNames,
        expectedMcpServerNames,
        expectedHookNames,
        releaseAge,
      } = yield* collectMaterializeSteps({
        selection,
        ...(packRecovery === undefined ? {} : { packRecovery }),
      });
      const selectionTouches = (unitType: "rule" | "hook"): boolean => {
        if (!scoped) return true;
        if (Option.isSome(type) && type.value === unitType) return true;
        if (Option.isSome(target)) {
          const parsedType = parseExtensionFqnParts(target.value)?.type;
          return parsedType === unitType || parsedType === "pack";
        }
        return false;
      };
      const projectionFacts = yield* invariantFacts.projectionFacts;
      const hookProjectionFacts = projectionFacts.filter(({ subject }) =>
        subject.unitId.startsWith("hook:"),
      );
      const ruleProjectionFacts = projectionFacts.filter(
        ({ subject }) => subject.unitId === "rule:instructions-region",
      );
      const knowledgeProjectionFacts = projectionFacts.filter(
        ({ subject }) => subject.unitId === "knowledge:discovery-region",
      );
      const knowledgeStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
        scoped || !cleanupSafe
          ? Option.none<PlannedJobStep<SyncPlanRequirements>>()
          : yield* collectKnowledgeStep({
              adapter: syncStepFailureAdapter,
              deferPreview: knowledgeMayChange,
              facts: knowledgeProjectionFacts,
            }).pipe(Effect.mapError(syncFailureToAppError));
      const hooksStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> = selectionTouches(
        "hook",
      )
        ? yield* collectHooksStep({
            facts: hookProjectionFacts,
            adapter: syncStepFailureAdapter,
          }).pipe(Effect.mapError(syncFailureToAppError))
        : Option.none<PlannedJobStep<SyncPlanRequirements>>();
      const cleanupStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
        scoped || !cleanupSafe
          ? Option.none<PlannedJobStep<SyncPlanRequirements>>()
          : yield* collectCleanupStep({
              expectedSkillNames,
              expectedSubagentNames,
              expectedMcpServerNames,
              expectedHookNames,
              adapter: syncStepFailureAdapter,
            }).pipe(Effect.mapError(syncFailureToAppError));
      const instructionStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> = selectionTouches(
        "rule",
      )
        ? yield* collectInstructionStep({
            projectionFacts: ruleProjectionFacts,
            adapter: syncStepFailureAdapter,
          }).pipe(Effect.mapError(syncFailureToAppError))
        : Option.none<PlannedJobStep<SyncPlanRequirements>>();
      return {
        steps,
        knowledgeStep,
        hooksStep,
        cleanupStep,
        instructionStep,
        releaseAge,
        serialMaterialization,
      };
    }),
  );
  const {
    steps,
    knowledgeStep,
    hooksStep,
    cleanupStep,
    instructionStep,
    releaseAge,
    serialMaterialization,
  } = preflight;
  const materializeSteps = steps.map((step, index): PlannedJobStep<SyncPlanRequirements> => {
    if (step.readiness === "error") {
      return step;
    }
    const before =
      index === 0 && hooks.beforeMaterialization !== undefined
        ? hooks.beforeMaterialization()
        : Effect.void;
    const after =
      hooks.afterMaterialization === undefined ? Effect.void : hooks.afterMaterialization(index);
    return {
      ...step,
      run: before.pipe(
        Effect.andThen(step.run),
        Effect.tap(() => after),
      ),
    };
  });

  const baseSteps = [
    ...materializeSteps,
    ...Option.toArray(knowledgeStep),
    ...Option.toArray(hooksStep),
    ...Option.toArray(cleanupStep),
    ...Option.toArray(instructionStep),
  ];
  const lockfileNeedsRecovery =
    (yield* ws.getLockfileState().pipe(Effect.mapError(toAppError))) !== "ok";
  if (baseSteps.length === 0 && !lockfileNeedsRecovery) {
    yield* emitNoOpOutcome("sync", {
      planName,
      planDescription,
      message: upToDateMessage,
    });
    return;
  }

  const plan = makeSyncPlan({
    materializeSteps,
    knowledgeStep,
    hooksStep,
    cleanupStep,
    instructionStep,
    releaseAge,
    serialMaterialization,
    name: planName,
    description: planDescription,
  });

  // Sync confirms nothing in advance: it applies ready reconciliation work and
  // stops before mutation if a plan ever carries an unexpected confirmable
  // condition, naming interactive approval rather than a flag it lacks.
  const execution = yield* makePlanExecution(
    { preview: args.preview },
    makeConfirmationRecovery(
      ["sync"],
      [
        ...Option.match(Option.flatten(Option.fromUndefinedOr(args.target)), {
          onNone: () => [],
          onSome: (target) => [recoveryPositional(publicRecoveryValue(target))],
        }),
        ...Option.match(Option.flatten(Option.fromUndefinedOr(args.type)), {
          onNone: () => [],
          onSome: (type) => [recoveryOption("--type", publicRecoveryValue(type))],
        }),
        recoverySwitch("--fail-on-change", args.failOnChange === true),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution }).pipe(
    Effect.provide(syncPlanLayer),
  );
  const outcome = deriveOperationOutcome(resolution);
  const diverged =
    args.failOnChange === true && outcome === "previewed" && resolution.units.length > 0;
  yield* emitOperationResolution(
    "sync",
    diverged ? { ...resolution, divergence: true } : resolution,
    diverged
      ? { message: "Workspace reconciliation is required; no changes were applied" }
      : outcome === "no-op" && resolution.units.length === 0
        ? { message: upToDateMessage }
        : {},
  );
});
