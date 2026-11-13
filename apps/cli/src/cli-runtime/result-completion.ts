import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import {
  awaitDrained,
  settleOperation,
  type OperationMode,
  type SettledOutcome,
} from "@agentxm/workspace-kernel/operations";
import {
  getOperationSettlement,
  setOperationSettlement,
  type OperationSettlement,
} from "./operation-exit.js";
import { getCommandSemanticProperties, setCommandSemanticProperties } from "./telemetry.js";
import { failureToAppError } from "../app-error/conversions.js";
import { exitCodeFor } from "../app-error/index.js";

/** One producer decision, shared by the result, lifecycle, telemetry and exit. */
export interface ResultCompletion extends OperationSettlement {
  readonly mode: OperationMode;
  readonly outcome: SettledOutcome;
}

/** Expected cancellation and typed failures keep their meaning after operation start. */
export const failedResultCompletion = (mode: OperationMode, error: unknown): ResultCompletion => {
  if (
    Predicate.hasProperty(error, "_tag") &&
    (error._tag === "QuestionCancelled" ||
      error._tag === "WorkspaceInitializationCancelled" ||
      error._tag === "InstallSelectionCancelled" ||
      error._tag === "AuthInteractionAbandoned")
  )
    return { mode, outcome: "cancelled", exitCode: 0 };
  const failure = failureToAppError(error);
  return {
    mode,
    outcome: failure.status === "pending-human" ? "pending-human" : "failed",
    exitCode: exitCodeFor(failure.code),
    failure: {
      code: failure.code,
      phase: "command",
      handled: true,
      ...(failure.diagnostic ?? { kind: "diagnostic.unclassified", operation: "runtime.command" }),
    },
  };
};

export const completeResult = (completion: ResultCompletion): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* setOperationSettlement(completion);
    const properties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({ ...properties, "cli.outcome": completion.outcome });
    yield* settleOperation(completion.outcome);
    yield* awaitDrained;
  });

/** Immediate read documents need no operation lifecycle or workspace services. */
export const resultCompletion = (explicit?: ResultCompletion): Effect.Effect<ResultCompletion> =>
  Effect.gen(function* () {
    if (explicit !== undefined) {
      yield* completeResult(explicit);
      return explicit;
    }
    const recorded = yield* getOperationSettlement;
    if (Option.isSome(recorded)) return recorded.value;
    const completed: ResultCompletion = { mode: "query", outcome: "completed", exitCode: 0 };
    yield* completeResult(completed);
    return completed;
  });
