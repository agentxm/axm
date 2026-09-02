import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import {
  AuthClient,
  AuthLoginInteraction,
  authLoginRequired,
  readStepUpRequest,
  StepUpRequired,
  resolveRequiredToken,
  type StepUpRequest,
} from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import { AppError } from "../app-error/index.js";
import { isNonInteractive, jsonFlag } from "../cli-flags/index.js";
import { Screen, paragraphDoc } from "../screen/index.js";
import { coerceAuthFailure } from "../feature-errors.js";

export interface StepUpOperationMessages {
  readonly initial: string;
  readonly success: string;
  readonly failure: string;
  readonly cancelled: string;
  readonly waiting: string;
  readonly authorized: string;
}

const failureStepUpRequest = (failure: unknown): StepUpRequest | null =>
  failure instanceof StepUpRequired
    ? failure.stepUp
    : failure instanceof AppError
      ? readStepUpRequest(failure)
      : null;

export const runWithStepUp = <A, E, R>(
  operation: (stepUpRequestId?: string) => Effect.Effect<A, E, R>,
  messages: StepUpOperationMessages,
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const initial = yield* screen.task(messages.initial, () => Effect.result(operation()), {
      failureMessage: messages.cancelled,
      successMessage: (result) => {
        if (Result.isSuccess(result)) return messages.success;
        return failureStepUpRequest(result.failure) === null
          ? messages.failure
          : "Additional verification required";
      },
    });
    if (Result.isSuccess(initial)) {
      return { value: initial.success, stepUpCompleted: false };
    }

    const stepUp = failureStepUpRequest(initial.failure);
    if (stepUp === null) {
      return yield* Effect.fail(initial.failure);
    }

    const registryUrl = yield* RegistryUrl;
    const authClient = yield* AuthClient;
    const interaction = yield* AuthLoginInteraction;
    const nonInteractive = yield* isNonInteractive;
    const jsonMode = Option.getOrElse(yield* jsonFlag, () => false);
    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: authLoginRequired("Not authenticated"),
    }).pipe(Effect.mapError(coerceAuthFailure));

    const opened =
      nonInteractive || jsonMode ? false : yield* interaction.openBrowser(stepUp.verificationUrl);
    for (const instruction of [
      `Action: ${stepUp.action}`,
      `Target: ${stepUp.target}`,
      `Verify at: ${stepUp.verificationUrl}`,
      `Verification expires at: ${stepUp.expiresAt}`,
      opened
        ? "A browser was opened. This command will retry automatically after verification."
        : "Open the verification URL in a browser. This command will retry automatically after verification.",
      "If verification expires or is cancelled, rerun the command to restart.",
    ]) {
      yield* screen.note(paragraphDoc(instruction), { persistent: true });
    }

    yield* screen.task(
      messages.waiting,
      () =>
        authClient
          .waitForStepUpRequest(token.token, stepUp.statusUrl, stepUp.intervalSeconds)
          .pipe(Effect.mapError(coerceAuthFailure)),
      { successMessage: messages.authorized },
    );
    const value = yield* screen.task(messages.initial, () => operation(stepUp.requestId), {
      successMessage: messages.success,
    });
    return { value, stepUpCompleted: true };
  });
