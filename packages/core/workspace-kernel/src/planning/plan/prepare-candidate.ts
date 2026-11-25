/**
 * Candidate preparation.
 *
 * `prepareExecutionCandidate` turns a plan into the immutable execution
 * candidate every later step refers to: it augments the plan with lockfile
 * reconciliation, projects configured-agent outcomes, scans readiness,
 * assembles the semantic risk conditions, and fingerprints the material
 * preimages. `prepareCompositeChildPlan` augments a child plan the same way
 * for a composite operation that seals its own candidate.
 *
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  StaleExecutionCandidate,
  StepFailure,
  observeUnit,
  publishPhaseStarted,
  type ConfiguredAgentOperation,
  type Plan,
} from "../../operations/index.js";
import {
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  withLiveWorkspaceObservations,
  withWorkspaceReadView,
} from "../../workspace-state/index.js";
import { augmentPlanWithReconciliation } from "../operations/augment-plan.js";
import { projectConfiguredAgentOutcomes } from "./configured-agent-outcomes.js";
import { executionExposureRisks } from "./execution-exposure.js";
import {
  withExecutionWithdrawals,
  type ExecutionWithdrawalSubject,
} from "./execution-withdrawal.js";
import { makeExecutionCandidate, observeCompositeChildMaterials } from "./execution-candidate.js";
import { withPhaseSpan } from "./operation-phase.js";
import { preflightPackagePlacement } from "./package-placement.js";
import { acquisitionRefsForStep } from "./registry-exposure.js";

/** The readiness blockers a plan's error steps contribute beyond declared conditions. */
export const readinessBlockersOf = <Requirements, Output>(plan: Plan<Requirements, Output>) => {
  const declaredConditionIds = new Set(
    (plan.riskConditions ?? []).map((condition) => condition.id),
  );
  const hasRunnable = plan.jobs.some((job) => job.steps.some((step) => step.readiness !== "error"));
  return plan.jobs
    .filter((job) => !hasRunnable || job.executionPolicy !== "best-effort")
    .flatMap((job) =>
      job.steps.flatMap((step) =>
        step.readiness === "error"
          ? (step.blockingConditionIds ?? []).length > 0 &&
            (step.blockingConditionIds ?? []).every((id) => declaredConditionIds.has(id))
            ? []
            : [
                {
                  level: "blocked" as const,
                  id: step.key ?? step.label,
                  detail: step.errorMessage,
                  errorCode: "conflict" as const,
                },
              ]
          : [],
      ),
    );
};

export interface PrepareExecutionCandidateOptions {
  /** Operations whose configured-agent outcomes the candidate projects and, after apply, verifies. */
  readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
  /** Subjects losing execution, including Pack members; actual native outcomes determine withdrawals. */
  readonly executionWithdrawals?: ReadonlyArray<ExecutionWithdrawalSubject>;
  /** Digest of observations revalidated by the owning use case before apply. */
  readonly observedInputFingerprint?: string;
}

/**
 * Augment a plan for sealing: lockfile reconciliation, configured-agent
 * outcomes, placement preflight, execution withdrawals, the external execution
 * review with its preimage when the plan exposes hooks or MCP servers, and
 * every readiness and precondition blocker as a risk condition.
 */
const augmentExecutionPlan = Effect.fnUntraced(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: PrepareExecutionCandidateOptions,
) {
  const location = yield* WorkspaceLocation;
  const lockfile = yield* LockfileReader;
  const settings = yield* SettingsReader;

  yield* publishPhaseStarted("planning");

  // Lockfile reconciliation, observed as one planning unit.
  const augmented = yield* observeUnit(
    { id: "lockfile-reconciliation", label: "lockfile reconciliation" },
    augmentPlanWithReconciliation(plan, () => lockfile.state),
  );

  const operations = options?.configuredAgentOperations ?? [];
  const configuredAgents = operations.length === 0 ? [] : yield* settings.configuredAgents;
  const originalSteps = plan.jobs.flatMap((job) => job.steps);
  const withProjectedOutcomes = yield* projectConfiguredAgentOutcomes(
    augmented.plan,
    originalSteps,
    operations,
    configuredAgents,
  );
  const placement = yield* preflightPackagePlacement(
    originalSteps.flatMap(acquisitionRefsForStep),
    originalSteps.flatMap((step) => step.exposureRefs ?? []),
  ).pipe(Effect.result);
  const placementPlan: Plan<Requirements, Output> = Result.isSuccess(placement)
    ? {
        ...augmented.plan,
        materialPaths: [...(augmented.plan.materialPaths ?? []), ...placement.success],
      }
    : {
        ...augmented.plan,
        preconditions: [
          ...(augmented.plan.preconditions ?? []),
          {
            id: "retained-package-placement",
            label: "Retained package placement",
            status: "unmet",
            detail: placement.failure.detail,
          },
        ],
      };
  const augmentedPlan = yield* withExecutionWithdrawals(
    withProjectedOutcomes(placementPlan),
    options?.executionWithdrawals ??
      operations
        .filter((operation) => operation.plannedState !== "enabled")
        .map((operation) => ({ type: operation.extensionType, name: operation.name })),
  );

  const materialBoundary = {
    settingsPath: location.settingsPath,
    lockPath: location.lockPath,
    baseDir: location.baseDir,
    ...(options?.observedInputFingerprint === undefined
      ? {}
      : { observedInputFingerprint: options.observedInputFingerprint }),
  };
  // The reviewed source must not change before its preimage is sealed. Apply's
  // freshness check then protects the interval from sealing to mutation.
  const beforeReview = augmentedPlan.jobs.some((job) =>
    job.steps.some(
      (step) =>
        step.readiness !== "error" &&
        step.exposureRefs?.some(
          (ref) =>
            ref.refType !== "workspace" && (ref.type === "hook" || ref.type === "mcp-server"),
        ),
    ),
  )
    ? yield* withLiveWorkspaceObservations(
        makeExecutionCandidate(augmentedPlan, materialBoundary, operations),
      )
    : undefined;

  // Readiness blockers and unmet preconditions join the declared risk
  // conditions, so the candidate carries every reason it could be refused.
  const preconditionBlockers = (augmentedPlan.preconditions ?? []).flatMap((precondition) =>
    precondition.status === "unmet"
      ? [
          {
            level: "blocked" as const,
            id: precondition.id,
            detail: precondition.detail ?? precondition.label,
            errorCode:
              precondition.blockedOn === "human"
                ? ("auth_required" as const)
                : ("conflict" as const),
          },
        ]
      : [],
  );
  const riskConditions = [
    ...(augmentedPlan.riskConditions ?? []),
    ...(yield* withLiveWorkspaceObservations(executionExposureRisks(augmentedPlan)).pipe(
      Effect.catch((cause) =>
        Effect.succeed([
          {
            level: "blocked" as const,
            id: "execution-review-unavailable",
            errorCode: "validation" as const,
            detail:
              cause instanceof StepFailure
                ? cause.detail
                : "External execution review could not establish the exact content and configuration.",
          },
        ]),
      ),
    )),
    ...readinessBlockersOf(augmentedPlan),
    ...preconditionBlockers,
  ];
  const candidatePlan: Plan<Requirements, Output> = {
    ...augmentedPlan,
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
  };
  return { candidatePlan, operations, materialBoundary, beforeReview };
});

type AugmentedExecutionPlan<Requirements, Output> = Effect.Success<
  ReturnType<typeof augmentExecutionPlan<Requirements, Output>>
>;

/**
 * Seal an augmented plan: fingerprint every material preimage and derive the
 * candidate identity, refusing a plan whose inputs changed during its review.
 */
const sealExecutionCandidate = Effect.fnUntraced(function* <Requirements, Output>(
  planName: string,
  augmented: AugmentedExecutionPlan<Requirements, Output>,
) {
  const candidate = yield* withLiveWorkspaceObservations(
    makeExecutionCandidate(
      augmented.candidatePlan,
      augmented.materialBoundary,
      augmented.operations,
    ),
  );
  if (
    augmented.beforeReview !== undefined &&
    augmented.beforeReview.materialFingerprint !== candidate.materialFingerprint
  )
    return yield* new StaleExecutionCandidate({ candidate: planName });
  return candidate;
});

/**
 * Prepare the immutable execution candidate for a plan: augment with lockfile
 * reconciliation, project configured-agent outcomes, scan readiness, assemble
 * risk conditions, and fingerprint every material preimage. Preview,
 * confirmation, and apply all refer to the candidate this returns.
 */
const prepareExecutionCandidateInPlanning = Effect.fnUntraced(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: PrepareExecutionCandidateOptions,
) {
  return yield* sealExecutionCandidate(plan.name, yield* augmentExecutionPlan(plan, options));
});

export const prepareExecutionCandidate = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: PrepareExecutionCandidateOptions,
) =>
  withPhaseSpan(
    "planning",
    withWorkspaceReadView(prepareExecutionCandidateInPlanning(plan, options)),
  );

/**
 * A child plan augmented for a composite operation, which seals one candidate
 * over its children's steps. It carries no identity or fingerprint, so only
 * the composite's own candidate can be previewed, confirmed or applied.
 */
interface CompositeChildPlan<Requirements = never, Output = never> {
  readonly plan: Plan<Requirements, Output>;
  readonly configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation>;
}

/** A composite child derives no identity, so no observed input enters one. */
export type CompositeChildPlanOptions = Omit<
  PrepareExecutionCandidateOptions,
  "observedInputFingerprint"
>;

const prepareCompositeChildPlanInPlanning = Effect.fnUntraced(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: CompositeChildPlanOptions,
) {
  const augmented = yield* augmentExecutionPlan(plan, options);
  if (augmented.beforeReview !== undefined) {
    // The reviewed preimage stays bracketed by this child's own seal: the
    // review's text travels into the composite's risk conditions.
    const candidate = yield* sealExecutionCandidate(plan.name, augmented);
    return {
      plan: candidate.plan,
      configuredAgentOperations: candidate.configuredAgentOperations,
    } satisfies CompositeChildPlan<Requirements, Output>;
  }
  // The child's own materials stay observed here; the composite's seal
  // fingerprints the workspace settings and lockfile and derives the identity.
  yield* withLiveWorkspaceObservations(
    observeCompositeChildMaterials(augmented.candidatePlan, augmented.materialBoundary),
  );
  return {
    plan: augmented.candidatePlan,
    configuredAgentOperations: augmented.operations,
  } satisfies CompositeChildPlan<Requirements, Output>;
});

/**
 * Augment a child plan exactly as `prepareExecutionCandidate` does, for a
 * composite operation that keeps only the child's steps, risk conditions and
 * configured-agent operations and seals them in its own candidate.
 */
export const prepareCompositeChildPlan = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: CompositeChildPlanOptions,
) =>
  withPhaseSpan(
    "planning",
    withWorkspaceReadView(prepareCompositeChildPlanInPlanning(plan, options)),
  );
