import * as Effect from "effect/Effect";
import type { CliError } from "../cli-error/index.js";
import type { Operation, Plan } from "./plan.js";
import {
  lockfilePolicyPrecedence,
  type LockfilePolicy,
  type OperationMetadata,
} from "./operation-metadata.js";
import { getOperationMetadata } from "./operation-registry.js";
import {
  isInjectedReconciliationOperation,
  makeReadRecoverStep,
  makeReconcileMaterializeStep,
} from "./reconciliation.js";

export type LockfileState = "ok" | "missing" | "invalid";

export interface AugmentMetadata {
  readonly lockfilePolicy: LockfilePolicy;
  readonly origin?: "augmentPlan";
}

type OperationWithMetadata = Operation<string, unknown> & {
  readonly metadata?: OperationMetadata;
};

export interface AugmentPlanContext {
  readonly getLockfileState: () => Effect.Effect<LockfileState, CliError>;
}

export interface AugmentPlanDiagnostics {
  readonly warnings: ReadonlyArray<string>;
}

export interface AugmentPlanResult<Op extends Operation<string, unknown>> {
  readonly plan: Plan<Op>;
  readonly diagnostics: AugmentPlanDiagnostics;
}

const getOperationPolicy = (operation: Operation<string, unknown>): LockfilePolicy => {
  const registryMetadata = getOperationMetadata(operation.name);
  if (registryMetadata._tag === "Some") {
    return registryMetadata.value.lockfilePolicy;
  }

  const legacyMetadata = (operation as OperationWithMetadata).metadata;
  return legacyMetadata?.lockfilePolicy ?? "ignore_if_missing";
};

export const getEffectiveLockfilePolicy = <Op extends Operation<string, unknown>>(
  plan: Plan<Op>,
): LockfilePolicy => {
  let effective: LockfilePolicy = "ignore_if_missing";

  for (const job of plan.jobs) {
    for (const step of job.steps) {
      if (step._tag !== "PlannedJobStep") {
        continue;
      }

      const candidate = getOperationPolicy(step.operation);
      if (lockfilePolicyPrecedence[candidate] > lockfilePolicyPrecedence[effective]) {
        effective = candidate;
      }
    }
  }

  return effective;
};

export const augmentPlan = <Op extends Operation<string, unknown>>(
  plan: Plan<Op>,
  context: AugmentPlanContext,
): Effect.Effect<AugmentPlanResult<Op>, CliError> =>
  Effect.gen(function* () {
    const hasInjectedOperations = plan.jobs.some((job) =>
      job.steps.some(
        (step) =>
          step._tag === "PlannedJobStep" && isInjectedReconciliationOperation(step.operation),
      ),
    );

    if (hasInjectedOperations) {
      return {
        plan,
        diagnostics: { warnings: [] },
      };
    }

    const effectivePolicy = getEffectiveLockfilePolicy(plan);
    const lockfileState = yield* context.getLockfileState();
    const warnings: string[] = [];

    if (effectivePolicy === "ignore_if_missing") {
      if (lockfileState === "invalid") {
        warnings.push("LOCKFILE_INVALID_IGNORED");
      }

      return {
        plan,
        diagnostics: { warnings },
      };
    }

    if (lockfileState === "ok") {
      return {
        plan,
        diagnostics: { warnings },
      };
    }

    if (lockfileState === "invalid") {
      warnings.push("LOCKFILE_INVALID_RECONCILE");
    }

    const readRecoverStep = makeReadRecoverStep(lockfileState);

    if (effectivePolicy === "read_recover_if_missing") {
      return {
        plan: {
          ...plan,
          jobs: [
            {
              concurrency: 1,
              steps: [readRecoverStep as unknown as Plan<Op>["jobs"][number]["steps"][number]],
            },
            ...plan.jobs,
          ],
        },
        diagnostics: { warnings },
      };
    }

    const materializeStep = makeReconcileMaterializeStep(lockfileState);

    return {
      plan: {
        ...plan,
        jobs: [
          {
            concurrency: 1,
            steps: [
              readRecoverStep as unknown as Plan<Op>["jobs"][number]["steps"][number],
              materializeStep as unknown as Plan<Op>["jobs"][number]["steps"][number],
            ],
          },
          ...plan.jobs,
        ],
      },
      diagnostics: { warnings },
    };
  });
