/**
 * Step-up verification: the protocol that carries one challenged Registry
 * write through human verification and retries it exactly once.
 *
 * The capability owns challenge detection, request-reference validation,
 * resumption and terminal-status rules, expiry, the bounded wait, and the
 * retry-once contract. The application supplies only presentation and browser
 * launch through the login presenter and interaction ports.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import { isRegistryClientFailure } from "@agentxm/registry-client";

import { AuthClient, readStepUpRequest } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import {
  authLoginRequired,
  RegistryAuthFailed,
  StepUpRequired,
  StepUpVerificationPending,
  type AuthError,
  type StepUpRequest,
} from "./errors.js";
import { AuthLoginInteraction } from "./login-interaction.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { resolveRequiredToken } from "./token-resolution.js";

/** How one challenged write names itself to a person watching the terminal. */
export interface StepUpPresentation {
  /** Lifecycle label for the challenged write itself. */
  readonly operationLabel: string;
  /** Lifecycle label for the bounded wait on human verification. */
  readonly waitingLabel: string;
}

/** The invocation's verification inputs, parsed from the command line. */
export interface StepUpOptions {
  /** Resume this exact pending request instead of issuing a fresh challenge. */
  readonly resumeReference?: string;
  /** Bounded wait, in whole seconds, for the person to verify. */
  readonly waitForHumanSeconds?: number;
  /** No terminal is available to guide a person through verification. */
  readonly unattended: boolean;
}

/** A challenged write that completed, and whether verification was needed. */
export interface VerifiedWrite<A> {
  readonly value: A;
  readonly stepUpCompleted: boolean;
}

const invalidReference = (detail: string, recover?: string) =>
  new RegistryAuthFailed({
    category: "validation",
    detail,
    ...(recover === undefined ? {} : { recover }),
  });

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
      invalidReference(
        "The step-up request URL must identify a step-up request on the selected Registry.",
        "Use the requestRef from this Registry's pending-human result.",
      ),
  });

const pendingVerification = (stepUp: StepUpRequest, registryUrl: string, timedOut: boolean) =>
  new StepUpVerificationPending({
    timedOut,
    action: {
      kind: "open-url",
      purpose: "step-up",
      requestRef: stepUp.statusUrl,
      registryUrl,
      url: stepUp.verificationUrl,
      expiresAt: stepUp.expiresAt,
      intervalSeconds: stepUp.intervalSeconds,
      resume: `Rerun the same command with the same inputs and --step-up-request ${stepUp.statusUrl}. Add --wait-for-human SECONDS for a bounded wait.`,
    },
  });

/** The challenge a failure carries, whether typed or still on the wire. */
const challengeOf = (failure: unknown): StepUpRequest | null =>
  failure instanceof StepUpRequired
    ? failure.stepUp
    : isRegistryClientFailure(failure)
      ? readStepUpRequest(failure)
      : null;

/**
 * Run a Registry write that may be challenged, carry the challenge through
 * human verification, and retry the write exactly once with the verified
 * request id.
 *
 * The write is never replayed without verification, and a wait that elapses
 * while the request is still valid resolves to `StepUpVerificationPending`
 * rather than a failure of the write.
 */
export const runWithStepUp = <A, E, R>(
  operation: (stepUpRequestId?: string) => Effect.Effect<A, E, R>,
  presentation: StepUpPresentation,
  options: StepUpOptions,
  registryUrl: string,
): Effect.Effect<
  VerifiedWrite<A>,
  E | AuthError | StepUpVerificationPending,
  R | AuthClient | AuthLoginInteraction | AuthLoginPresenter | CredentialStore
> =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const interaction = yield* AuthLoginInteraction;
    const presenter = yield* AuthLoginPresenter;
    const waitSeconds = options.waitForHumanSeconds;
    if (waitSeconds !== undefined && (!Number.isSafeInteger(waitSeconds) || waitSeconds <= 0)) {
      return yield* invalidReference("--wait-for-human must be a positive number of seconds.");
    }

    const resumedId =
      options.resumeReference === undefined
        ? undefined
        : yield* readRequestReference(options.resumeReference, registryUrl);
    const initial =
      resumedId === undefined
        ? yield* presenter.withProgress(
            { _tag: "RunningVerifiedWrite", operation: presentation.operationLabel },
            () => Effect.result(operation()),
          )
        : undefined;
    if (initial !== undefined && Result.isSuccess(initial)) {
      return { value: initial.success, stepUpCompleted: false };
    }
    const challenge =
      initial !== undefined && Result.isFailure(initial) ? challengeOf(initial.failure) : null;
    if (initial !== undefined && Result.isFailure(initial) && challenge === null) {
      return yield* Effect.fail(initial.failure);
    }

    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: authLoginRequired("Not authenticated"),
    });
    const resumed =
      resumedId === undefined
        ? undefined
        : yield* authClient.getStepUpRequest(token.token, resumedId);
    if (resumed !== undefined && resumed.status !== "pending" && resumed.status !== "verified") {
      return yield* new RegistryAuthFailed({
        category:
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
            action: presentation.operationLabel,
            target: presentation.operationLabel,
          } satisfies StepUpRequest)
        : null);
    if (stepUp === null) {
      return yield* new RegistryAuthFailed({
        category: "auth",
        detail: "The Registry did not return a verification request.",
      });
    }
    const challengeId = yield* readRequestReference(stepUp.statusUrl, registryUrl);
    if (challengeId !== stepUp.requestId) {
      return yield* invalidReference("The Registry returned mismatched step-up references.");
    }
    const now = yield* Clock.currentTimeMillis;
    const remaining = Date.parse(stepUp.expiresAt) - now;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return yield* new RegistryAuthFailed({
        category: "auth_expired",
        detail: "The step-up request has expired.",
      });
    }
    if (resumed?.status !== "verified") {
      if (options.unattended && waitSeconds === undefined) {
        return yield* pendingVerification(stepUp, registryUrl, false);
      }
      const opened = options.unattended
        ? false
        : yield* interaction.openBrowser(stepUp.verificationUrl);
      yield* presenter.presentStepUpChallenge({
        action: stepUp.action,
        target: stepUp.target,
        verificationUrl: stepUp.verificationUrl,
        expiresAt: stepUp.expiresAt,
        browserOpened: opened,
      });
      const waited = yield* presenter.withProgress(
        { _tag: "WaitingForHumanVerification", operation: presentation.waitingLabel },
        () =>
          authClient
            .waitForStepUpRequest(token.token, stepUp.statusUrl, stepUp.intervalSeconds)
            .pipe(
              Effect.timeoutOption(
                Duration.millis(
                  Math.min(remaining, waitSeconds === undefined ? remaining : waitSeconds * 1000),
                ),
              ),
            ),
      );
      if (Option.isNone(waited)) {
        if ((yield* Clock.currentTimeMillis) >= Date.parse(stepUp.expiresAt)) {
          return yield* new RegistryAuthFailed({
            category: "auth_expired",
            detail: "The step-up request has expired.",
          });
        }
        return yield* pendingVerification(stepUp, registryUrl, true);
      }
    }
    const value = yield* presenter.withProgress(
      { _tag: "RetryingVerifiedWrite", operation: presentation.operationLabel },
      () => operation(stepUp.requestId),
    );
    return { value, stepUpCompleted: true };
  });
