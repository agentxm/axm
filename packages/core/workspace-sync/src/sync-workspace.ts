/**
 * Reconciling the workspace with what its settings and lockfile declare.
 *
 * Sync is the one command that changes nothing about intent: it reads the
 * desired extension graph, compares it with what is actually materialized,
 * and makes the second match the first. That is why it confirms nothing in
 * advance — every step it plans is work the operator already asked for by
 * declaring the extension — and why a plan carrying a confirmable condition
 * stops rather than applying: such a condition means the sweep was about to
 * do something the declaration did not imply.
 *
 * A selection narrows the sweep to one extension, one type, or one Pack's
 * members. A narrowed sweep deliberately skips the workspace-wide sweeps
 * (cleanup of unowned rendered files, the Knowledge discovery region), because
 * those decide from the whole graph and a scoped run cannot see it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  ExtensionManagers,
  HookManager,
  KnowledgeManager,
  McpServerInstallRequirements,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "@agentxm/extension-materialization";
import {
  observeUnit,
  OperationJournal,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  ResolvePlanInteraction,
  type ApprovalRecoveryMissing,
  type CandidateFingerprintFailed,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlanInteractionFailed,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceInvariantFacts } from "@agentxm/workspace-projection";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceMutations,
  type LockfileValidationError,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";
import type {
  FootprintRecorder,
  WorkspaceTransitionAcquireFailure,
} from "@agentxm/workspace-transactions";

import { collectConfiguredPackRecovery } from "./configured-pack-recovery.js";
import { SyncStepFailureConversion, type SyncPolicyFailure } from "./failure-adapter.js";
import {
  collectMaterializeSteps,
  type CollectedMaterializeSteps,
  type ConfiguredEntryResolutionRequirements,
  type SyncSelection,
} from "./materialize.js";
import {
  collectCleanupStep,
  collectHooksStep,
  collectInstructionStep,
  collectKnowledgeStep,
  makeSyncPlan,
  SYNC_PLAN_DESCRIPTION,
  SYNC_PLAN_NAME,
  type SyncStepRequirements,
} from "./plan.js";

/** Everything a sync plan's steps need when they run. */
export type SyncWorkspaceRequirements =
  | ConfiguredAgentOutcomesProvider
  | ConfiguredEntryResolutionRequirements
  | ExtensionManagers
  | FootprintRecorder
  | HookManager
  | KnowledgeManager
  | McpServerInstallRequirements
  | RuleManager
  | SkillManager
  | SubagentManager
  | SyncStepFailureConversion
  | OperationJournal
  | ResolvePlanInteraction
  | SyncStepRequirements
  | WorkspaceInvariantFacts;

type SyncPlanStep = PlannedJobStep<SyncWorkspaceRequirements>;

/** Reconcile the workspace, or the part of it the selection names. */
export interface SyncWorkspaceRequest {
  /** One extension or Pack, by fully-qualified identifier. */
  readonly target: Option.Option<string>;
  readonly type: Option.Option<Exclude<ExtensionType, "pack">>;
}

/** The workspace already matches what it declares. */
export interface WorkspaceAlreadyReconciled {
  readonly _tag: "AlreadyReconciled";
  readonly message: string;
  readonly planName: string;
  readonly planDescription: string;
}

/** A settled reconciliation: every step it will take, in the order it takes them. */
export interface SyncWorkspaceCandidate {
  readonly _tag: "SyncWorkspace";
  readonly plan: Plan<SyncWorkspaceRequirements>;
  /** What the operator is told when the sweep turns out to change nothing. */
  readonly upToDateMessage: string;
}

/** Every failure settling a reconciliation can surface. */
export type SyncWorkspaceFailure = SyncPolicyFailure;

/** Every failure resolving a settled reconciliation can surface. */
export type SyncWorkspaceExecutionFailure =
  | ApprovalRecoveryMissing
  | CandidateFingerprintFailed
  | LockfileValidationError
  | PlanInteractionFailed
  | WorkspaceSettingsReadFailure
  | WorkspaceTransitionAcquireFailure;

const scopeLabelFor = (selection: SyncSelection): string =>
  Option.isSome(selection.target)
    ? selection.target.value
    : Option.isSome(selection.type)
      ? `type ${selection.type.value}`
      : "workspace";

/**
 * Whether a narrowed sweep touches one of the shared aggregate units. A
 * selection that names a Pack touches all of them, because a Pack can
 * contribute any member type.
 */
const selectionTouches = (selection: SyncSelection, unitType: "rule" | "hook"): boolean => {
  if (Option.isNone(selection.target) && Option.isNone(selection.type)) return true;
  if (Option.isSome(selection.type) && selection.type.value === unitType) return true;
  if (Option.isSome(selection.target)) {
    const parsedType = parseExtensionFqnParts(selection.target.value)?.type;
    return parsedType === unitType || parsedType === "pack";
  }
  return false;
};

/**
 * Plan the materialization half of a sweep on its own.
 *
 * Configuring a coding agent materializes every installed extension for the
 * resulting membership, so the configuration use case applies these steps
 * inside its own membership closure. The steps are planned against the
 * membership that closure is about to record, not the one on disk.
 */
export const planWorkspaceMaterialization = (args: {
  readonly selection?: SyncSelection;
  /** Desired agent set for membership preflight before settings are committed. */
  readonly configuredAgents?: ReadonlyArray<string>;
}): Effect.Effect<CollectedMaterializeSteps, SyncWorkspaceFailure, SyncWorkspaceRequirements> =>
  Effect.gen(function* () {
    const conversion = yield* SyncStepFailureConversion;
    return yield* collectMaterializeSteps({
      ...(args.selection === undefined ? {} : { selection: args.selection }),
      ...(args.configuredAgents === undefined ? {} : { configuredAgents: args.configuredAgents }),
      adapter: conversion,
    });
  });

/**
 * Settle a reconciliation request into the plan it will run.
 *
 * A workspace that already matches its declaration settles as
 * `AlreadyReconciled` rather than as an empty plan: a sweep that would change
 * nothing is a fact worth reporting, not an operation worth resolving. The
 * lockfile is the exception — a lockfile needing recovery is planned work even
 * when nothing else diverged.
 */
export const prepareSyncWorkspace = (
  request: SyncWorkspaceRequest,
): Effect.Effect<
  SyncWorkspaceCandidate | WorkspaceAlreadyReconciled,
  SyncWorkspaceFailure,
  SyncWorkspaceRequirements
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const invariantFacts = yield* WorkspaceInvariantFacts;
    const conversion = yield* SyncStepFailureConversion;
    const selection: SyncSelection = { target: request.target, type: request.type };
    const scoped = Option.isSome(request.target) || Option.isSome(request.type);
    const scopeLabel = scopeLabelFor(selection);
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
        const packRecovery = yield* collectConfiguredPackRecovery({
          selection,
          adapter: conversion,
        });
        const collected = yield* collectMaterializeSteps({
          selection,
          ...(packRecovery === undefined ? {} : { packRecovery }),
          adapter: conversion,
        });
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
        // The workspace-wide sweeps read the whole graph, so a scoped run and
        // an incomplete graph both leave them out rather than deciding from a
        // partial view.
        const knowledgeStep: Option.Option<SyncPlanStep> =
          scoped || !collected.cleanupSafe
            ? Option.none()
            : yield* collectKnowledgeStep({
                adapter: conversion,
                deferPreview: collected.knowledgeMayChange,
                facts: knowledgeProjectionFacts,
              });
        const hooksStep: Option.Option<SyncPlanStep> = selectionTouches(selection, "hook")
          ? yield* collectHooksStep({ facts: hookProjectionFacts, adapter: conversion })
          : Option.none();
        const cleanupStep: Option.Option<SyncPlanStep> =
          scoped || !collected.cleanupSafe
            ? Option.none()
            : yield* collectCleanupStep({
                expectedSkillNames: collected.expectedSkillNames,
                expectedSubagentNames: collected.expectedSubagentNames,
                expectedMcpServerNames: collected.expectedMcpServerNames,
                expectedHookNames: collected.expectedHookNames,
                adapter: conversion,
              });
        const instructionStep: Option.Option<SyncPlanStep> = selectionTouches(selection, "rule")
          ? yield* collectInstructionStep({
              projectionFacts: ruleProjectionFacts,
              adapter: conversion,
            })
          : Option.none();
        return { collected, knowledgeStep, hooksStep, cleanupStep, instructionStep };
      }),
    );

    const { collected, knowledgeStep, hooksStep, cleanupStep, instructionStep } = preflight;
    const materializeSteps: ReadonlyArray<SyncPlanStep> = collected.steps;
    const stepCount =
      materializeSteps.length +
      Option.toArray(knowledgeStep).length +
      Option.toArray(hooksStep).length +
      Option.toArray(cleanupStep).length +
      Option.toArray(instructionStep).length;
    const lockfileNeedsRecovery = (yield* ws.getLockfileState()) !== "ok";
    if (stepCount === 0 && !lockfileNeedsRecovery) {
      return {
        _tag: "AlreadyReconciled",
        message: upToDateMessage,
        planName,
        planDescription,
      };
    }

    return {
      _tag: "SyncWorkspace",
      plan: makeSyncPlan({
        materializeSteps,
        knowledgeStep,
        hooksStep,
        cleanupStep,
        instructionStep,
        releaseAge: collected.releaseAge,
        serialMaterialization: collected.serialMaterialization,
        name: planName,
        description: planDescription,
      }),
      upToDateMessage,
    };
  });

/**
 * Preview or apply a settled reconciliation. Sync confirms nothing in
 * advance, so the execution the caller supplies carries no interactive
 * approval; a plan that turns out to need one stops before mutating.
 */
export const previewOrApplySyncWorkspace = (
  candidate: SyncWorkspaceCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  SyncWorkspaceExecutionFailure,
  SyncWorkspaceRequirements
> =>
  Effect.gen(function* () {
    const prepared = yield* prepareExecutionCandidate(candidate.plan);
    return yield* resolveExecutionCandidate(prepared, execution);
  });

/** The workspace-reconciliation use case. */
export const SyncWorkspace = {
  prepare: prepareSyncWorkspace,
  previewOrApply: previewOrApplySyncWorkspace,
  planMaterialization: planWorkspaceMaterialization,
} as const;
