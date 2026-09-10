import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
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
import { observeUnit } from "@agentxm/workspace-operations";
import { AppError, makeAppError } from "../app-error/index.js";
import { isNonInteractive, jsonFlag, HumanVerificationOptions } from "../cli-flags/index.js";
import { Screen, paragraphDoc } from "../screen/index.js";
import { coerceAuthFailure } from "../feature-errors.js";
import { withLiveOperation } from "./shared/operation-lifecycle.js";

export interface StepUpOperation {
  readonly command: string;
  readonly name: string;
  readonly waiting: string;
}

const failureStepUpRequest = (failure: unknown): StepUpRequest | null =>
  failure instanceof StepUpRequired
    ? failure.stepUp
    : failure instanceof AppError
      ? readStepUpRequest(failure)
      : null;

/** Request references may only address the selected Registry's step-up resource. */
const readRequestReference = (reference: string, registryUrl: string) =>
  Effect.try({
    try: () => {
      const url = new URL(reference);
      const registry = new URL(registryUrl);
      const match = /^\/v1\/auth\/step-up\/requests\/(step_[a-z0-9]+)$/.exec(url.pathname);
      if (
        url.origin !== registry.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        match?.[1] === undefined
      )
        throw new Error("Invalid step-up reference");
      return match[1];
    },
    catch: () =>
      makeAppError({
        code: "validation",
        detail: "The step-up request URL must identify a step-up request on the selected Registry.",
        recover: "Use the requestRef from this Registry's pending-human result.",
      }),
  });

const pendingHandoff = (stepUp: StepUpRequest, registryUrl: string, timedOut = false) => {
  const resume = `Rerun the same command with the same inputs and --step-up-request ${stepUp.statusUrl}. Add --wait-for-human SECONDS for a bounded wait.`;
  return makeAppError({
    code: timedOut ? "timeout" : "auth_required",
    detail: "Human verification is pending. No challenged write has completed.",
    status: "pending-human",
    retryable: true,
    blockedOn: "human",
    action: {
      kind: "open-url",
      purpose: "step-up",
      requestRef: stepUp.statusUrl,
      registryUrl,
      url: stepUp.verificationUrl,
      expiresAt: stepUp.expiresAt,
      intervalSeconds: stepUp.intervalSeconds,
      resume,
    },
    recover: resume,
  });
};

export const runWithStepUp = <A, E, R>(
  operation: (stepUpRequestId?: string) => Effect.Effect<A, E, R>,
  messages: StepUpOperation,
) =>
  withLiveOperation(
    { command: messages.command, name: messages.name, mode: "apply" },
    runStepUpBody(operation, messages),
  );

const runStepUpBody = <A, E, R>(
  operation: (stepUpRequestId?: string) => Effect.Effect<A, E, R>,
  messages: StepUpOperation,
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const registryUrl = yield* RegistryUrl;
    const authClient = yield* AuthClient;
    const interaction = yield* AuthLoginInteraction;
    const nonInteractive = yield* isNonInteractive;
    const jsonMode = Option.getOrElse(yield* jsonFlag, () => false);
    const { stepUpRequest: resumeReference, waitForHuman: waitSeconds } =
      yield* HumanVerificationOptions;
    if (
      Option.isSome(waitSeconds) &&
      (!Number.isSafeInteger(waitSeconds.value) || waitSeconds.value <= 0)
    ) {
      return yield* makeAppError({
        code: "validation",
        detail: "--wait-for-human must be a positive number of seconds.",
      });
    }

    const resumedId = Option.isSome(resumeReference)
      ? yield* readRequestReference(resumeReference.value, registryUrl)
      : undefined;
    const initial =
      resumedId === undefined
        ? yield* observeUnit({ id: "operation", label: messages.name }, Effect.result(operation()))
        : undefined;
    if (initial !== undefined && Result.isSuccess(initial)) {
      return { value: initial.success, stepUpCompleted: false };
    }
    const challenge =
      initial !== undefined && Result.isFailure(initial)
        ? failureStepUpRequest(initial.failure)
        : null;
    if (initial !== undefined && Result.isFailure(initial) && challenge === null) {
      return yield* Effect.fail(initial.failure);
    }

    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: authLoginRequired("Not authenticated"),
    }).pipe(Effect.mapError(coerceAuthFailure));
    const resumed =
      resumedId === undefined
        ? undefined
        : yield* authClient
            .getStepUpRequest(token.token, resumedId)
            .pipe(Effect.mapError(coerceAuthFailure));
    if (resumed !== undefined && resumed.status !== "pending" && resumed.status !== "verified") {
      return yield* makeAppError({
        code:
          resumed.status === "expired"
            ? "auth_expired"
            : resumed.status === "cancelled"
              ? "auth_denied"
              : "conflict",
        detail: `The step-up request is ${resumed.status}. It cannot be resumed.`,
        recover:
          "Review the result of the previous request before explicitly starting a new command without --step-up-request.",
      });
    }
    const stepUp =
      challenge ??
      (resumed !== undefined && resumedId !== undefined
        ? ({
            requestId: resumedId,
            statusUrl: new URL(`/v1/auth/step-up/requests/${resumedId}`, registryUrl).href,
            verificationUrl: new URL(`/step-up/${resumedId}`, authClient.getAuthorizationIssuer())
              .href,
            expiresAt: DateTime.formatIso(resumed.expires_at),
            intervalSeconds: 2,
            action: messages.command,
            target: messages.name,
          } satisfies StepUpRequest)
        : null);
    if (stepUp === null) {
      return yield* makeAppError({
        code: "auth",
        detail: "The Registry did not return a verification request.",
      });
    }
    const challengeId = yield* readRequestReference(stepUp.statusUrl, registryUrl);
    if (challengeId !== stepUp.requestId)
      return yield* makeAppError({
        code: "validation",
        detail: "The Registry returned mismatched step-up references.",
      });
    const now = yield* Clock.currentTimeMillis;
    const remaining = Date.parse(stepUp.expiresAt) - now;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return yield* makeAppError({
        code: "auth_expired",
        detail: "The step-up request has expired.",
      });
    }
    if (resumed?.status !== "verified") {
      if ((nonInteractive || jsonMode) && Option.isNone(waitSeconds)) {
        return yield* pendingHandoff(stepUp, registryUrl);
      }
      const opened =
        nonInteractive || jsonMode ? false : yield* interaction.openBrowser(stepUp.verificationUrl);
      for (const instruction of [
        `Action: ${stepUp.action}`,
        `Target: ${stepUp.target}`,
        `Verify at: ${stepUp.verificationUrl}`,
        `Verification expires at: ${stepUp.expiresAt}`,
        opened
          ? "A browser was opened. This command will retry once after verification."
          : "Open the verification URL in a browser. This command will retry once after verification.",
      ])
        yield* screen.note(paragraphDoc(instruction), { persistent: true });
      const waited = yield* observeUnit(
        { id: "step-up-verification", label: messages.waiting },
        authClient
          .waitForStepUpRequest(token.token, stepUp.statusUrl, stepUp.intervalSeconds)
          .pipe(
            Effect.mapError(coerceAuthFailure),
            Effect.timeoutOption(
              Duration.millis(
                Math.min(
                  remaining,
                  Option.isSome(waitSeconds) ? waitSeconds.value * 1000 : remaining,
                ),
              ),
            ),
          ),
      );
      if (Option.isNone(waited)) {
        if ((yield* Clock.currentTimeMillis) >= Date.parse(stepUp.expiresAt))
          return yield* makeAppError({
            code: "auth_expired",
            detail: "The step-up request has expired.",
          });
        return yield* pendingHandoff(stepUp, registryUrl, true);
      }
    }
    const value = yield* observeUnit(
      { id: "operation-retry", label: messages.name },
      operation(stepUp.requestId),
    );
    return { value, stepUpCompleted: true };
  });
