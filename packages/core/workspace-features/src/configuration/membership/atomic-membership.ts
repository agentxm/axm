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
} from "@agentxm/workspace-kernel/operations";
import {
  SettingsReader,
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type SettingsReaderService,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "@agentxm/workspace-kernel/settlement";

import {
  captureRequiredNativeOutputs,
  captureNativeOutputRetention,
  validateNativeOutputPostconditions,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  refreshNativeRegionReaders,
  type NativeRetentionWitness,
} from "@agentxm/workspace-kernel/projection";
import { nativeUnitKey, type NativeLocationOutcome } from "@agentxm/workspace-kernel/locations";

import {
  WorkspaceConfigurationFailed,
  configurationFailureToStepFailure,
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
  | Requirements
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceTransactionScope
  | ConfiguredAgentOutcomesProvider
  | DesiredStateReader
  | WorkspaceLocation
  | WorkspaceRecords
  | SettingsReader;

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
  settings: SettingsReaderService,
  transition: MembershipTransition,
): Effect.Effect<void, StepFailure> =>
  Effect.gen(function* () {
    const configured = new Set(
      yield* settings.configuredAgents.pipe(Effect.mapError(workspaceChangeFailedToStepFailure)),
    );
    const unmet =
      transition.kind === "add"
        ? transition.agentIds.filter((agentId) => !configured.has(agentId))
        : transition.agentIds.filter((agentId) => configured.has(agentId));
    if (unmet.length === 0) return;
    return yield* configurationFailureToStepFailure(
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
  SettingsReader
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
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
    const expected = executable.flatMap((step) => step.artifact?.nativeLocations ?? []);
    const transition = runWorkspaceTransaction<
      {
        readonly results: ReadonlyArray<JobStepResult<Output>>;
        readonly retained: ReadonlyArray<NativeRetentionWitness>;
        readonly required: ReadonlyArray<NativeLocationOutcome>;
      },
      StepFailure,
      AtomicMembershipRequirements<Requirements>
    >({
      transition: Effect.gen(function* () {
        const required = yield* Effect.gen(function* () {
          const configured = yield* settings.configuredAgents;
          const configuredAgents =
            args.transition.kind === "remove"
              ? configured.filter((agent) => !args.transition.agentIds.includes(agent))
              : [...new Set([...configured, ...args.transition.agentIds])];
          const graph = yield* (yield* DesiredStateReader).graph();
          const existing = yield* captureRequiredNativeOutputs(
            graph.nodes.filter((node) => node.enabled && node.type !== "pack"),
            { configuredAgents, planned: expected },
          );
          const observedKeys = new Set(existing.map(nativeUnitKey));
          // Current observations own retained routes; planned mutations keep
          // their preflight states and are never fingerprinted as unchanged.
          return [
            ...existing,
            ...expected.filter((unit) => !observedKeys.has(nativeUnitKey(unit))),
          ];
        }).pipe(
          Effect.mapError(
            (cause) =>
              new StepFailure({
                category: "conflict",
                detail: "Cannot capture required native outputs before membership reconciliation",
                cause,
              }),
          ),
        );
        const retained = yield* captureNativeOutputRetention(required).pipe(
          Effect.mapError(
            (cause) => new StepFailure({ category: cause.category, detail: cause.detail, cause }),
          ),
        );
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
        // A later instruction step can retire aliases recorded by cleanup.
        // Publish every shared region with readers from the settled closure.
        const regions = results.flatMap((result) =>
          result.result === "success"
            ? (result.artifact?.nativeLocations ?? []).filter(
                (unit) => unit.address.kind === "region",
              )
            : [],
        );
        if (regions.length === 0) return { results, retained, required };
        const location = yield* WorkspaceLocation;
        const refreshed = yield* refreshNativeRegionReaders(regions, {
          workspaceRoot: location.baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          configuredAgentIds: yield* settings.configuredAgents.pipe(
            Effect.mapError(workspaceChangeFailedToStepFailure),
          ),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new StepFailure({
                category: "conflict",
                detail: "Cannot verify final native readers after membership reconciliation",
                cause,
              }),
          ),
        );
        const current = new Map(refreshed.map((unit) => [nativeUnitKey(unit), unit]));
        const settledResults = results.map((result): JobStepResult<Output> => {
          if (result.result !== "success" || result.artifact?.nativeLocations === undefined)
            return result;
          return {
            ...result,
            artifact: {
              ...result.artifact,
              nativeLocations: result.artifact.nativeLocations.map((unit) => {
                const observed = current.get(nativeUnitKey(unit));
                return observed === undefined
                  ? unit
                  : {
                      ...unit,
                      aliases: observed.aliases,
                      configuredConsumers: observed.configuredConsumers,
                      potentialReaders: observed.potentialReaders,
                      availability: observed.availability,
                    };
              }),
            },
          };
        });
        return { results: settledResults, retained, required };
      }),
      validate: ({ results, retained, required }) =>
        verifyTransition(settings, args.transition).pipe(
          Effect.andThen(
            validateNativeOutputPostconditions(
              results.flatMap((result) =>
                result.result === "success" ? (result.artifact?.nativeLocations ?? []) : [],
              ),
              required,
              retained,
            ).pipe(
              Effect.mapError(
                (cause) =>
                  new StepFailure({ category: cause.category, detail: cause.detail, cause }),
              ),
            ),
          ),
        ),
    }).pipe(
      Effect.map(({ results }) => results),
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
