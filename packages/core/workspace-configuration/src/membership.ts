/**
 * Configured-agent membership policy: agent-id validation for membership
 * changes and the atomic application of membership and materialization steps
 * through one workspace transaction. The application supplies the failure
 * conversion so step categories and details stay byte-identical with its
 * rendered errors.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  HOSTED_AGENTS_BY_ID,
  HOSTED_AGENT_IDS,
  type HostedAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import {
  StepFailure,
  type JobStepResult,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";
import { WorkspaceConfigurationFailed } from "./errors.js";

const configurableAgentIds = new Set<string>(CONFIGURABLE_AGENT_IDS);
const hostedAgentIds = new Set<string>(HOSTED_AGENT_IDS);

const isHostedAgentId = (id: string): id is HostedAgentId => hostedAgentIds.has(id);

const numberAt = (values: ReadonlyArray<number>, index: number): number => values[index] ?? 0;

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_value, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        numberAt(current, rightIndex) + 1,
        numberAt(previous, rightIndex + 1) + 1,
        numberAt(previous, rightIndex) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? left.length;
};

const nearestAgentId = (input: string): string | undefined => {
  let best: { readonly id: string; readonly distance: number } | undefined;

  for (const id of CONFIGURABLE_AGENT_IDS) {
    const distance = editDistance(input, id);
    if (best === undefined || distance < best.distance) {
      best = { id, distance };
    }
  }

  if (best === undefined) return undefined;
  return best.distance <= Math.max(3, Math.floor(input.length / 2)) ? best.id : undefined;
};

export const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(new Set(values));

export const validateAgentIds = (
  ids: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    for (const id of ids) {
      if (id === "universal") {
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail:
            "`universal` is always materialized automatically and cannot be added or removed.",
          suggestions: [{ description: "Choose one of the configurable coding-agent IDs." }],
        });
      }

      if (isHostedAgentId(id)) {
        const agent = HOSTED_AGENTS_BY_ID[id];
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `${agent.name} is a hosted agent and cannot be added to local workspace configuration. ${agent.installTarget.instructions}`,
          suggestions: [
            {
              description: `Open the ${agent.name} skill installation guide.`,
              url: agent.installTarget.docs,
            },
          ],
        });
      }

      if (!configurableAgentIds.has(id)) {
        const nearest = nearestAgentId(id);
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `Unknown agent ID: ${id}`,
          suggestions: [
            nearest === undefined
              ? { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" }
              : {
                  description: `Did you mean "${nearest}"?`,
                  cmd: `axm agents add ${nearest}`,
                },
          ],
        });
      }
    }

    return dedupe(ids);
  });

interface AtomicMembershipStepsArgs<Requirements, Output, ValidateError> {
  readonly ws: WorkspaceMutationsService;
  readonly steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>;
  readonly validate: (
    results: ReadonlyArray<JobStepResult<Output>>,
  ) => Effect.Effect<void, ValidateError, Requirements>;
  /** Application-owned conversion into the plan-step failure vocabulary. */
  readonly toStepFailure: (failure: unknown) => StepFailure;
}

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
 * Keep plan-level preview and per-step results while applying every membership
 * and artifact step through one workspace transaction.
 */
export const makeAtomicMembershipSteps = Effect.fn("Agents.makeAtomicMembershipSteps")(function* <
  Requirements,
  Output,
  ValidateError,
>(args: AtomicMembershipStepsArgs<Requirements, Output, ValidateError>) {
  if (args.steps.some((step) => step.readiness === "error")) return args.steps;

  const executable = args.steps.filter(
    (
      step,
    ): step is Exclude<PlannedJobStep<Requirements, Output>, { readonly readiness: "error" }> =>
      step.readiness !== "error",
  );
  const attemptRef = yield* Ref.make<AtomicAttempt<Output>>({ results: [] });
  const transition = args.ws
    .runTransaction({
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
      validate: (results) => args.validate(results).pipe(Effect.mapError(args.toStepFailure)),
    })
    .pipe(
      Effect.catch((transactionError) =>
        Ref.get(attemptRef).pipe(
          Effect.map((attempt) =>
            rollbackResults(
              executable,
              attempt,
              transactionError._tag === "StepFailure"
                ? transactionError
                : args.toStepFailure(transactionError),
            ),
          ),
        ),
      ),
    );
  const sharedTransition = yield* Effect.cached(transition);
  let resultIndex = 0;

  return args.steps.map((step): PlannedJobStep<Requirements, Output> => {
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
  });
});
