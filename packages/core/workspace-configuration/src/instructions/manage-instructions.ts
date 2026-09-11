/**
 * Instruction-file management: whether this workspace propagates one source
 * instruction file to the agents it configures, and the transition between
 * that choice and the files on disk.
 *
 * Three requests share one shape. Status reports what the workspace does
 * today without touching it. Enabling records the chosen source file and
 * reconciles every alias AXM owns to it — including removing the aliases a
 * previous choice owned, so changing the source filename never leaves the old
 * arrangement behind. Disabling removes the aliases AXM owns and records that
 * the workspace no longer propagates instructions.
 *
 * Every transition passes one readiness gate before it is planned: AXM
 * refuses to reconcile a target it cannot prove it owns, and refuses to edit
 * a `.gitignore` region it did not write. The gate is stated once here rather
 * than at each call site, because a caller that forgot it would silently
 * overwrite a person's file.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { RuleManager, type ManagerRequirements } from "@agentxm/extension-materialization";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  OperationJournal,
  ResolvePlanInteraction,
  StepFailure,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type JobStepArtifact,
  type JobStepResult,
  type OperationPresentation,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  applyPlannedProjections,
  disableInstructionManagement,
  instructionProjectionEffects,
  instructionProjectionRemovalEffects,
  instructionReconciliationReadiness,
  instructionStateIsCurrent,
  InstructionMaintenanceFailed,
  observeInstructions,
  observeProjectionPlans,
  reconcileInstructionTransition,
  removeInstructionTargetsFor,
  resolveInstructionsConfig,
  type InstructionProjectionEffect,
  type InstructionProjectionSnapshot,
  type ResolvedInstructionsConfig,
} from "@agentxm/workspace-projection";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceMutations,
  type InstructionsConfig,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import {
  FootprintRecorder,
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "@agentxm/workspace-transactions";

import {
  WorkspaceConfigurationFailed,
  configurationFailedToStepFailure,
  workspaceChangeFailedToStepFailure,
  type WorkspaceConfigurationExecutionFailure,
} from "../errors.js";

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

const InstructionStatusItemSchema = Schema.Struct({
  root: Schema.String,
  agentId: Schema.String,
  agentName: Schema.String,
  sourceFile: Schema.String,
  targetFile: Schema.String,
  mechanism: Schema.String,
  health: Schema.String,
  ownership: Schema.String,
  observedForm: Schema.String,
  details: Schema.String,
});

/** Every failure observing or planning instruction management can surface. */
export type ManageInstructionsFailure =
  | WorkspaceConfigurationFailed
  | WorkspaceStateReadFailure
  | Effect.Error<ReturnType<typeof observeInstructions>>;

/** What the workspace does about instruction files right now. */
export const InstructionsStatusSchema = Schema.Struct({
  enabled: Schema.Boolean,
  sourceFileName: Schema.String,
  gitignoreAliases: Schema.Boolean,
  roots: Schema.Array(Schema.String),
  missingSources: Schema.Array(Schema.String),
  items: Schema.Array(InstructionStatusItemSchema),
  staleTargets: Schema.Array(InstructionStatusItemSchema),
});
export type InstructionsStatus = typeof InstructionsStatusSchema.Type;

const DISABLED_STATUS: InstructionsStatus = {
  enabled: false,
  sourceFileName: "AGENTS.md",
  gitignoreAliases: false,
  roots: [],
  missingSources: [],
  items: [],
  staleTargets: [],
};

/**
 * Report instruction-file management without changing it. A workspace that
 * does not manage instruction files reports that, rather than an empty
 * observation of a configuration it does not have.
 */
export const instructionsStatus = (): Effect.Effect<
  InstructionsStatus,
  Effect.Error<ReturnType<typeof observeInstructions>>,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const configured = yield* workspace.getInstructionsConfig();
    if (Option.isNone(configured) || configured.value === false) return DISABLED_STATUS;
    const snapshot = yield* observeInstructions({
      ws: workspace,
      config: resolveInstructionsConfig(configured.value),
    });
    return snapshot.status;
  });

// -----------------------------------------------------------------------------
// Requests and candidates
// -----------------------------------------------------------------------------

export type ManageInstructionsRequest =
  | {
      readonly action: "enable";
      /** The source-of-truth instruction file every alias points at. */
      readonly fileName: string;
      /** Keep the propagated alias files out of Git. */
      readonly gitignoreAliases: boolean;
    }
  | { readonly action: "disable" };

/** A request the workspace already satisfies. */
export interface InstructionsUnchanged {
  readonly _tag: "Unchanged";
  readonly action: "enable" | "disable";
  readonly message: string;
}

export interface ManageInstructionsCandidate {
  readonly _tag: "ManageInstructions";
  readonly action: "enable" | "disable";
  /** The configuration recorded once the change settles. */
  readonly config: ResolvedInstructionsConfig | false;
  /** The configuration whose aliases the transition removes first, if any. */
  readonly supersededConfig: Option.Option<ResolvedInstructionsConfig>;
  /** Every file the transition creates, updates, or removes. */
  readonly effects: ReadonlyArray<InstructionProjectionEffect>;
  /** The gate's refusal, when the workspace is not safe to reconcile. */
  readonly blocked: Option.Option<WorkspaceConfigurationFailed>;
  readonly scope: WorkspaceScope;
}

const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

/**
 * The transition's artifact: the settings file that records the choice, plus
 * every instruction file the reconciliation touches, workspace-relative.
 */
const instructionArtifact = (args: {
  readonly scope: WorkspaceScope;
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly effects: ReadonlyArray<InstructionProjectionEffect>;
}): JobStepArtifact => {
  const settings = settingsDisplayPath(args.scope);
  const byPath = new Map<
    string,
    { readonly path: string; readonly change: "created" | "updated" | "removed" }
  >();
  byPath.set(settings, { path: settings, change: "updated" });
  for (const effect of args.effects) {
    const relative = args.path.relative(args.baseDir, effect.path);
    byPath.set(relative, { path: relative, change: effect.change });
  }
  return {
    path: settings,
    scope: args.scope,
    change: "updated",
    targets: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
};

const rawConfigMatches = (
  observed: InstructionsConfig | false,
  desired: ResolvedInstructionsConfig,
): boolean => {
  if (observed === false) return false;
  const resolved = resolveInstructionsConfig(observed);
  return (
    resolved.fileName === desired.fileName && resolved.gitignoreAliases === desired.gitignoreAliases
  );
};

/**
 * The one readiness gate every instruction transition passes. It is stated
 * here because it decides whether AXM may write at all: an unowned target or
 * an unrecognized `.gitignore` region means the workspace holds a file AXM
 * did not create, and reconciliation stops before it can overwrite it.
 */
const reconciliationGate = (
  snapshot: InstructionProjectionSnapshot,
): Effect.Effect<
  Option.Option<WorkspaceConfigurationFailed>,
  never,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const failure = yield* instructionReconciliationReadiness({ ws: workspace, snapshot });
    return Option.map(
      failure,
      (readiness) =>
        new WorkspaceConfigurationFailed({
          category: "conflict",
          detail:
            readiness._tag === "InstructionMaintenanceFailed"
              ? readiness.detail
              : "Instruction reconciliation cannot proceed against the current workspace",
          cause: readiness,
        }),
    );
  });

/**
 * Settle an instruction-management request into the transition it makes.
 *
 * A request the workspace already satisfies is reported as unchanged rather
 * than planned: enabling the configuration that is already recorded, and
 * whose targets are already current, changes nothing.
 */
export const prepareManageInstructions = (
  request: ManageInstructionsRequest,
): Effect.Effect<
  ManageInstructionsCandidate | InstructionsUnchanged,
  ManageInstructionsFailure,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path | RuleManager | ManagerRequirements
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const recorded = yield* workspace.getInstructionsConfig();

    if (request.action === "disable") {
      if (Option.isNone(recorded) || recorded.value === false) {
        const settled: InstructionsUnchanged = {
          _tag: "Unchanged",
          action: "disable",
          message: "Instruction-file management is already disabled.",
        };
        return settled;
      }
      const config = resolveInstructionsConfig(recorded.value);
      const snapshot = yield* observeInstructions({ ws: workspace, config });
      const disableCandidate: ManageInstructionsCandidate = {
        _tag: "ManageInstructions",
        action: "disable",
        config: false,
        supersededConfig: Option.some(config),
        effects: instructionProjectionRemovalEffects(snapshot),
        blocked: yield* reconciliationGate(snapshot),
        scope: workspace.scope,
      };
      return disableCandidate;
    }

    const desired = resolveInstructionsConfig({
      fileName: request.fileName,
      gitignoreAliases: request.gitignoreAliases,
    });
    const previous =
      Option.isSome(recorded) && recorded.value !== false
        ? Option.some(resolveInstructionsConfig(recorded.value))
        : Option.none<ResolvedInstructionsConfig>();
    const configChanged =
      Option.isSome(previous) &&
      (previous.value.fileName !== desired.fileName ||
        previous.value.gitignoreAliases !== desired.gitignoreAliases);
    const observed = yield* observeInstructions({ ws: workspace, config: desired });

    if (
      Option.isSome(recorded) &&
      rawConfigMatches(recorded.value, desired) &&
      instructionStateIsCurrent(observed)
    ) {
      const settled: InstructionsUnchanged = {
        _tag: "Unchanged",
        action: "enable",
        message: "Instruction-file management is already enabled.",
      };
      return settled;
    }

    // A changed configuration is preflighted against the aliases the previous
    // configuration owns, because those are the files the transition removes.
    const superseded = configChanged ? previous : Option.none<ResolvedInstructionsConfig>();
    const preflight = Option.isSome(superseded)
      ? yield* observeInstructions({ ws: workspace, config: superseded.value })
      : observed;
    const ruleManager = yield* RuleManager;
    const ruleEffects = (yield* ruleManager.projectionPlans().pipe(
      Effect.flatMap(observeProjectionPlans),
      Effect.mapError(
        (cause) =>
          new WorkspaceConfigurationFailed({
            category: "internal",
            detail: "Rule projections could not be observed before reconciling instructions",
            cause,
          }),
      ),
    ))
      .filter((observation) => !observation.current)
      .map((observation) => ({
        path: path.resolve(
          workspace.baseDir,
          observation.path.split("#", 1)[0] ?? observation.path,
        ),
        change: "updated" as const,
      }));

    const enableCandidate: ManageInstructionsCandidate = {
      _tag: "ManageInstructions",
      action: "enable",
      config: desired,
      supersededConfig: superseded,
      effects: [
        ...(Option.isSome(superseded) ? instructionProjectionRemovalEffects(preflight) : []),
        ...ruleEffects,
        ...instructionProjectionEffects(observed),
      ],
      blocked: yield* reconciliationGate(preflight),
      scope: workspace.scope,
    };
    return enableCandidate;
  });

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

const PRESENTATION = {
  enable: {
    name: "Enable instruction-file management",
    verb: { imperative: "enable", past: "Enabled", gerund: "Enabling" },
    applied: "Enabled and reconciled instruction-file management",
  },
  disable: {
    name: "Disable instruction-file management",
    verb: { imperative: "disable", past: "Disabled", gerund: "Disabling" },
    applied: "Disabled instruction-file management and removed owned aliases",
  },
} as const satisfies Record<
  "enable" | "disable",
  { readonly name: string; readonly verb: OperationPresentation["verb"]; readonly applied: string }
>;

/** Every service the instruction transition and its plan resolution need. */
export type ManageInstructionsRequirements =
  | ConfiguredAgentOutcomesProvider
  | FileSystem.FileSystem
  | FootprintRecorder
  | OperationJournal
  | Path.Path
  | ResolvePlanInteraction
  | ManagerRequirements
  | RuleManager
  | WorkspaceMutations
  | WorkspaceTransactionScope;

const transitionEffect = (
  candidate: ManageInstructionsCandidate & { readonly action: "enable" },
  config: ResolvedInstructionsConfig,
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const ruleManager = yield* RuleManager;
    if (Option.isSome(candidate.supersededConfig)) {
      yield* removeInstructionTargetsFor({
        ws: workspace,
        config: candidate.supersededConfig.value,
      });
    }
    yield* workspace.setInstructionsConfig({
      fileName: config.fileName,
      gitignoreAliases: config.gitignoreAliases,
    });
    yield* applyPlannedProjections(ruleManager);
  });

/**
 * Serialize the instruction-projection failures the transition can surface.
 * Ownership refusals keep the sentence the projection chose; the rest are
 * workspace-change failures the shared conversion already renders.
 */
/**
 * Serialize whatever the recorded transition failed with. The refusals this
 * feature and the projection decide keep their own sentence and category;
 * anything the kernel could not complete is an internal step failure that
 * carries its cause, so the resolution still reports why.
 */
const transitionFailureToStepFailure = (failure: { readonly _tag: string }): StepFailure => {
  if (failure instanceof StepFailure) return failure;
  if (failure instanceof WorkspaceConfigurationFailed) {
    return configurationFailedToStepFailure(failure);
  }
  if (failure instanceof InstructionMaintenanceFailed) {
    return new StepFailure({
      category: failure.category,
      detail: failure.detail,
      ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  return new StepFailure({
    category: "internal",
    detail: `Instruction reconciliation could not complete (${failure._tag})`,
    cause: failure,
  });
};

const transitionStep = (
  candidate: ManageInstructionsCandidate,
  artifact: JobStepArtifact,
): PlannedJobStep<ManageInstructionsRequirements> => {
  const presentation = PRESENTATION[candidate.action];
  if (Option.isSome(candidate.blocked)) {
    return {
      label: presentation.name,
      readiness: "error",
      errorMessage: candidate.blocked.value.detail,
    };
  }
  const transition: Effect.Effect<void, StepFailure, ManageInstructionsRequirements> =
    candidate.action === "disable"
      ? Effect.gen(function* () {
          const workspace = yield* WorkspaceMutations;
          const config = Option.getOrUndefined(candidate.supersededConfig);
          if (config === undefined) {
            return yield* new WorkspaceConfigurationFailed({
              category: "internal",
              detail: "Instruction management has no recorded configuration to disable",
            });
          }
          yield* disableInstructionManagement({ ws: workspace, config });
        }).pipe(Effect.asVoid, Effect.mapError(transitionFailureToStepFailure))
      : Effect.gen(function* () {
          const workspace = yield* WorkspaceMutations;
          const config = candidate.config;
          if (config === false) {
            return yield* new WorkspaceConfigurationFailed({
              category: "internal",
              detail: "Enabling instruction management has no configuration to record",
            });
          }
          yield* reconcileInstructionTransition({
            ws: workspace,
            config,
            ...(Option.isSome(candidate.supersededConfig)
              ? { preflightConfig: candidate.supersededConfig.value }
              : {}),
            transition: transitionEffect({ ...candidate, action: "enable" }, config),
          });
        }).pipe(Effect.asVoid, Effect.mapError(transitionFailureToStepFailure));
  return {
    label: presentation.name,
    readiness: "ready",
    artifact,
    run: runWorkspaceTransaction({
      transition,
      validate: () => Effect.void,
    }).pipe(
      Effect.mapError(workspaceChangeFailedToStepFailure),
      Effect.as({
        result: "success",
        message: presentation.applied,
        artifact,
      } satisfies JobStepResult),
    ),
  };
};

/**
 * Preview or apply a settled instruction transition. The whole transition —
 * removing superseded aliases, recording the choice, and reconciling every
 * target — runs inside one workspace transaction, so a reconciliation that
 * cannot complete never leaves the choice recorded.
 */
export const previewOrApplyManageInstructions = (
  candidate: ManageInstructionsCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  WorkspaceConfigurationExecutionFailure,
  ManageInstructionsRequirements
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const artifact = instructionArtifact({
      scope: candidate.scope,
      baseDir: workspace.baseDir,
      path,
      effects: candidate.effects,
    });
    const plan: Plan<ManageInstructionsRequirements> = {
      _tag: "Plan",
      name: PRESENTATION[candidate.action].name,
      description: Option.some(
        candidate.action === "disable"
          ? "Turn off instruction-file propagation"
          : `Use ${candidate.config === false ? "AGENTS.md" : candidate.config.fileName} as the source instruction file`,
      ),
      presentation: {
        verb: PRESENTATION[candidate.action].verb,
        subject: { singular: "instruction file", plural: "instruction files" },
      },
      jobs: [{ concurrency: 1, steps: [transitionStep(candidate, artifact)] }],
    };
    const prepared = yield* prepareExecutionCandidate(plan);
    return yield* resolveExecutionCandidate(prepared, execution);
  });

/** The instruction-management use case. */
export const ManageInstructions = {
  status: instructionsStatus,
  prepare: prepareManageInstructions,
  previewOrApply: previewOrApplyManageInstructions,
} as const;
