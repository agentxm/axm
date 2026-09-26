/**
 * Realizing an activation change, for every extension type through one
 * recipe: publish the proposed desired state, then ask each kind manager to
 * materialize what became active or withdraw what became inactive, render the
 * shared aggregate units once for the whole change, and retire the acquired
 * content nothing reaches any more.
 *
 * What became active is materialized by the same sync steps `axm sync` runs,
 * so enabling and reconciling cannot disagree about what an active extension
 * looks like: a subagent enabled on an agent without native support gets the
 * same advisory role-skill fallback install writes. What became inactive is
 * withdrawn by the manager that owns the projection, which keeps canonical
 * content and the accepted resolution in place.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { DesiredExtensionNode, LockfileReader } from "../desired-state/index.js";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
} from "../materialization/index.js";
import {
  applyInstructionSurfacePlans,
  applyProjectionPlans,
  projectionPlanExclusionWarnings,
  type ProjectionPlan,
} from "../projection/index.js";
import type { JobStepArtifact, PlannedJobStep } from "../transitions/planning/index.js";
import { WorkspaceSyncFailed } from "./errors.js";
import type { SyncFailureAdapter } from "./failure-adapter.js";
import {
  collectMaterializeSteps,
  type CollectedMaterializeSteps,
  type SyncSelection,
} from "./materialize.js";
import type { SyncStepRequirements } from "./plan.js";
import { publishDesiredState, type DesiredStateProposal } from "./proposed-state.js";
import { collectUnreachableRetirement } from "./retirement.js";

/** The types whose projection is a shared aggregate unit rendered once per change. */
const AGGREGATE_UNIT_TYPES: ReadonlySet<ExtensionType> = new Set<ExtensionType>([
  "rule",
  "hook",
  "knowledge",
]);

/** An activation change, settled: what the graph will say, and how it is realized. */
export interface ActivationRealization {
  readonly proposal: DesiredStateProposal;
  readonly enabled: boolean;
  /** The desired nodes whose activation this change moves, in the resulting graph. */
  readonly subjects: ReadonlyArray<DesiredExtensionNode>;
  /** The sync steps that materialize what became active. */
  readonly materialization: Option.Option<CollectedMaterializeSteps>;
  /** The retirement of acquired content nothing reaches once the change applies. */
  readonly retirement: Option.Option<PlannedJobStep<SyncStepRequirements | LockfileReader>>;
}

/**
 * Decide how an activation change is realized, without writing anything.
 *
 * Enabling collects the materialize steps for the subjects against the
 * proposed graph. Disabling a Pack withdraws its dependency route, so the
 * members nothing else reaches are retired; disabling a leaf keeps its
 * canonical content and accepted resolution, so nothing is retired.
 */
export const prepareActivationRealization = (args: {
  readonly proposal: DesiredStateProposal;
  readonly enabled: boolean;
  readonly subjects: ReadonlyArray<DesiredExtensionNode>;
  /** Selects the subjects within the proposed graph for materialization. */
  readonly selection: SyncSelection;
  readonly adapter: SyncFailureAdapter;
  readonly retireUnreachable: boolean;
}) =>
  Effect.gen(function* () {
    const materialization = args.enabled
      ? Option.some(
          yield* collectMaterializeSteps({
            desiredState: args.proposal.after,
            settings: args.proposal.settings,
            selection: args.selection,
            adapter: args.adapter,
          }),
        )
      : Option.none<CollectedMaterializeSteps>();
    const retirement =
      !args.enabled && args.retireUnreachable
        ? yield* collectUnreachableRetirement(args.adapter, {
            resultingGraph: args.proposal.after,
            subjects: args.subjects,
          })
        : Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
    return {
      proposal: args.proposal,
      enabled: args.enabled,
      subjects: args.subjects,
      materialization,
      retirement,
    } satisfies ActivationRealization;
  });

/** Withdraw one leaf's own projection through the manager that owns it. */
const withdrawProjection = (
  node: DesiredExtensionNode,
): Effect.Effect<
  void,
  ExtensionManagerFailure,
  SkillManager | SubagentManager | McpServerManager | ManagerRequirements
> =>
  Effect.gen(function* () {
    switch (node.type) {
      case "skill":
        return yield* (yield* SkillManager)
          .materializeDeactivate({ target: { type: "skill", name: node.name } })
          .pipe(Effect.asVoid);
      case "subagent":
        return yield* (yield* SubagentManager)
          .materializeDeactivate({ target: { type: "subagent", name: node.name } })
          .pipe(Effect.asVoid);
      case "mcp-server":
        return yield* (yield* McpServerManager)
          .materializeDeactivate({ target: { type: "mcp-server", name: node.name } })
          .pipe(Effect.asVoid);
      case "rule":
      case "hook":
      case "knowledge":
      case "pack":
        // Shared aggregate units re-render once for the whole change.
        return;
    }
  });

/**
 * Render the shared aggregate units the moved subject types contribute to,
 * once for the whole change rather than once per contributor.
 */
const reconcileAggregateProjections = (
  types: ReadonlySet<ExtensionType>,
): Effect.Effect<
  ReadonlyArray<string>,
  ExtensionManagerFailure,
  RuleManager | HookManager | KnowledgeManager | ManagerRequirements
> =>
  Effect.gen(function* () {
    const plans: Array<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>> = [];
    if (types.has("rule")) plans.push(...(yield* (yield* RuleManager).projectionPlans()));
    if (types.has("hook")) plans.push(...(yield* (yield* HookManager).projectionPlans()));
    if (types.has("knowledge")) plans.push(...(yield* (yield* KnowledgeManager).projectionPlans()));
    return types.has("rule") || types.has("hook") || types.has("knowledge")
      ? yield* applyInstructionSurfacePlans(plans)
      : yield* applyProjectionPlans(plans).pipe(Effect.as(projectionPlanExclusionWarnings(plans)));
  });

const runStep = <R>(step: PlannedJobStep<R>) =>
  step.readiness === "error"
    ? new WorkspaceSyncFailed({ category: "conflict", detail: step.errorMessage })
    : step.run;

/** What realizing a change reported: projection warnings and the artifacts its steps observed. */
export interface ActivationRealized {
  readonly warnings: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<JobStepArtifact>;
}

/**
 * Apply a settled activation change inside the caller's transaction and
 * report the projection warnings it raised and the artifacts its steps
 * observed.
 */
export const realizeActivation = (realization: ActivationRealization) =>
  Effect.gen(function* () {
    yield* publishDesiredState(realization.proposal);
    const artifacts: Array<JobStepArtifact> = [];
    if (Option.isSome(realization.materialization)) {
      for (const step of realization.materialization.value.steps) {
        const result = yield* runStep(step);
        if (result.result === "success" && result.artifact !== undefined) {
          artifacts.push(result.artifact);
        }
      }
    }
    if (!realization.enabled) {
      yield* Effect.forEach(
        realization.subjects.filter((node) => !AGGREGATE_UNIT_TYPES.has(node.type)),
        withdrawProjection,
        { concurrency: 1, discard: true },
      );
    }
    const warnings = yield* reconcileAggregateProjections(
      new Set(realization.subjects.map((node) => node.type)),
    );
    if (Option.isSome(realization.retirement)) {
      const result = yield* runStep(realization.retirement.value);
      if (result.result === "success" && result.artifact !== undefined) {
        artifacts.push(result.artifact);
      }
    }
    return { warnings, artifacts } satisfies ActivationRealized;
  });
