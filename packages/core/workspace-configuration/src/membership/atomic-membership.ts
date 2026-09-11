/**
 * One workspace transaction for a configured-agent membership change.
 *
 * Membership is a set: a request that records `cursor` and then fails to
 * realize its outputs must leave the set as it found it. Every step of the
 * change therefore runs inside a single transaction, and the transaction only
 * settles once the workspace actually reports the transition the request
 * asked for. Both the post-transaction check and the failure vocabulary
 * belong here — an application that supplied either could make the same
 * membership change mean two different things.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import {
  StepFailure,
  type JobStepResult,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "@agentxm/workspace-transactions";

import {
  WorkspaceConfigurationFailed,
  configurationFailedToStepFailure,
  workspaceChangeFailedToStepFailure,
} from "../errors.js";

/** What the workspace must report once the transition has settled. */
export type MembershipTransition =
  | { readonly kind: "add"; readonly agentIds: ReadonlyArray<string> }
  | { readonly kind: "remove"; readonly agentIds: ReadonlyArray<string> };

interface AtomicMembershipStepsArgs<Requirements, Output> {
  readonly steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>;
  /** The membership change the settled workspace is checked against. */
  readonly transition: MembershipTransition;
}

/** The transaction scope and platform every atomic membership step joins. */
export type AtomicMembershipRequirements<Requirements> =
  Requirements | FileSystem.FileSystem | Path.Path | WorkspaceTransactionScope;

interface AtomicAttempt<Output> {
  readonly results: ReadonlyArray<JobStepResult<Output>>;
  readonly failedIndex?: number;
}

const failedResult = <Output>(
  error: StepFailure,
  message: string = error.detail,
): JobStepResult<Output> => ({
  result: "error",
  message,
  error,
});

const blockedResult = <Output>(message: string): JobStepResult<Output> =>
  failedResult(
    new StepFailure({
      category: "conflict",
      detail: message,
    }),
    message,
  );

const rollbackResults = <Requirements, Output>(
  executable: ReadonlyArray<
    Exclude<PlannedJobStep<Requirements, Output>, { readonly readiness: "error" }>
  >,
  attempt: AtomicAttempt<Output>,
  transactionError: StepFailure,
): ReadonlyArray<JobStepResult<Output>> => {
  const actualFailureIndex = attempt.failedIndex ?? Math.max(0, attempt.results.length - 1);
  const failedLabel = executable[actualFailureIndex]?.label ?? "atomic agent membership validation";

  return executable.map((_, index) => {
    if (index < actualFailureIndex) {
      return blockedResult(`blocked: rolled back after ${failedLabel} failed`);
    }
    if (index > actualFailureIndex) {
      return blockedResult(`blocked by ${failedLabel} failure`);
    }
    const attempted = attempt.results[index];
    return attempted?.result === "error"
      ? attempted
      : failedResult(transactionError, transactionError.detail);
  });
};

/**
 * Read the settled membership back and refuse the transaction when it does
 * not show the requested transition. A transition that wrote nothing and one
 * that wrote half are the same answer to the caller: the change did not
 * happen, and the transaction restores what it found.
 */
const verifyTransition = (
  workspace: WorkspaceMutationsService,
  transition: MembershipTransition,
): Effect.Effect<void, StepFailure> =>
  Effect.gen(function* () {
    const configured = new Set(
      yield* workspace
        .getConfiguredAgents()
        .pipe(Effect.mapError(workspaceChangeFailedToStepFailure)),
    );
    const unmet =
      transition.kind === "add"
        ? transition.agentIds.filter((agentId) => !configured.has(agentId))
        : transition.agentIds.filter((agentId) => configured.has(agentId));
    if (unmet.length === 0) return;
    return yield* configurationFailedToStepFailure(
      new WorkspaceConfigurationFailed({
        category: "internal",
        detail:
          transition.kind === "add"
            ? `Agent membership transition did not configure: ${unmet.join(", ")}`
            : `Agent membership transition did not remove: ${unmet.join(", ")}`,
      }),
    );
  });

/**
 * Keep plan-level preview and per-step results while applying every membership
 * and artifact step through one workspace transaction.
 */
export const makeAtomicMembershipSteps = <Requirements, Output>(
  args: AtomicMembershipStepsArgs<Requirements, Output>,
): Effect.Effect<
  ReadonlyArray<PlannedJobStep<AtomicMembershipRequirements<Requirements>, Output>>,
  never,
  WorkspaceMutations
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    if (args.steps.some((step) => step.readiness === "error")) {
      return args.steps.map(
        (step): PlannedJobStep<AtomicMembershipRequirements<Requirements>, Output> => step,
      );
    }

    const executable = args.steps.filter(
      (
        step,
      ): step is Exclude<PlannedJobStep<Requirements, Output>, { readonly readiness: "error" }> =>
        step.readiness !== "error",
    );
    const attemptRef = yield* Ref.make<AtomicAttempt<Output>>({ results: [] });
    const transition = runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const results: Array<JobStepResult<Output>> = [];
        for (const [index, step] of executable.entries()) {
          const result = yield* step.run.pipe(
            Effect.catch((error) => Effect.succeed(failedResult<Output>(error))),
          );
          results.push(result);
          yield* Ref.set(attemptRef, {
            results: [...results],
            ...(result.result === "error" ? { failedIndex: index } : {}),
          });
          if (result.result === "error") {
            return yield* result.error;
          }
        }
        return results;
      }),
      validate: () => verifyTransition(workspace, args.transition),
    }).pipe(
      Effect.catch((transactionError) =>
        Ref.get(attemptRef).pipe(
          Effect.map((attempt) =>
            rollbackResults(
              executable,
              attempt,
              transactionError._tag === "StepFailure"
                ? transactionError
                : new StepFailure({
                    category: "internal",
                    detail: "The agent membership transition did not complete",
                    cause: transactionError,
                  }),
            ),
          ),
        ),
      ),
    );
    const sharedTransition = yield* Effect.cached(transition);
    let resultIndex = 0;

    // Every step now runs the shared transaction, so the transaction scope and
    // platform join its requirements; the plan carries them to the boundary.
    return args.steps.map(
      (step): PlannedJobStep<AtomicMembershipRequirements<Requirements>, Output> => {
        if (step.readiness === "error") return step;
        const index = resultIndex;
        resultIndex += 1;
        return {
          ...step,
          run: sharedTransition.pipe(
            Effect.flatMap((results) => {
              const result = results[index];
              return result === undefined
                ? new StepFailure({
                    category: "internal",
                    detail: `Atomic agent membership transition omitted step ${index + 1}`,
                  })
                : Effect.succeed(result);
            }),
          ),
        };
      },
    );
  });
