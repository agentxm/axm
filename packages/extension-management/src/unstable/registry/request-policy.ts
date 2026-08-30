import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";

import { makeAppError, type AppError, type AppErrorMetadata } from "../app-error/index.js";
import { isAnyRegistryClientError, isHttpClientError } from "./error-mapping.js";
import { registryRetryAfterSeconds } from "./retry-after.js";

export interface RegistryRequestPolicy {
  readonly requestTimeout: Duration.Input;
  readonly totalDeadline: Duration.Input;
  readonly maxAttempts: number;
  readonly initialBackoff: Duration.Input;
  readonly maxBackoff: Duration.Input;
}

export const DEFAULT_REGISTRY_REQUEST_POLICY: RegistryRequestPolicy = {
  requestTimeout: "10 seconds",
  totalDeadline: "30 seconds",
  maxAttempts: 3,
  initialBackoff: "200 millis",
  maxBackoff: "2 seconds",
};

/** A publish may legitimately spend longer validating and persisting an archive. */
export const PUBLISH_REGISTRY_REQUEST_POLICY: RegistryRequestPolicy = {
  requestTimeout: "5 minutes",
  totalDeadline: "5 minutes",
  maxAttempts: 1,
  initialBackoff: "200 millis",
  maxBackoff: "2 seconds",
};

export type RegistryRequestReplaySafety =
  | { readonly kind: "safe" }
  | { readonly kind: "mutation" }
  | { readonly kind: "idempotency-keyed"; readonly idempotencyKey: string };

interface RetryEvidence {
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly body: unknown;
}

const retryEvidence = (error: unknown): RetryEvidence | undefined => {
  if (isHttpClientError(error) && error.reason._tag === "StatusCodeError") {
    return { response: error.reason.response, body: undefined };
  }
  if (isHttpClientError(error)) return undefined;
  if (isAnyRegistryClientError(error)) {
    return { response: error.response, body: error.cause };
  }
  return undefined;
};

const isRetryableRegistryError = (error: unknown): boolean => {
  if (Cause.isTimeoutError(error)) return true;
  if (isHttpClientError(error)) {
    if (error.reason._tag === "TransportError") return true;
    if (error.reason._tag !== "StatusCodeError") return false;
  }

  const evidence = retryEvidence(error);
  if (evidence === undefined) return false;
  return [408, 429, 500, 502, 503, 504].includes(evidence.response.status);
};

const getStringField = (value: unknown, field: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

const requestIdFromError = (error: unknown): string | undefined => {
  const body = retryEvidence(error)?.body;
  return getStringField(body, "requestId") ?? getStringField(body, "request_id");
};

const retryAfter = (error: unknown) =>
  Effect.gen(function* () {
    const evidence = retryEvidence(error);
    if (evidence === undefined) return undefined;
    const nowMillis = yield* Clock.currentTimeMillis;
    return registryRetryAfterSeconds({
      status: evidence.response.status,
      body: evidence.body,
      response: evidence.response,
      nowMillis,
    });
  });

const retrySchedule = (policy: RegistryRequestPolicy, operation: string) => {
  const totalDeadlineMillis = Duration.toMillis(Duration.fromInputUnsafe(policy.totalDeadline));
  const maxBackoffMillis = Duration.toMillis(Duration.fromInputUnsafe(policy.maxBackoff));

  return Schedule.exponential(policy.initialBackoff).pipe(
    Schedule.setInputType<unknown>(),
    Schedule.jittered,
    Schedule.modifyDelay(({ duration, input }) =>
      Effect.map(retryAfter(input), (serverSeconds) => {
        const cappedBackoff = Math.min(Duration.toMillis(duration), maxBackoffMillis);
        return Duration.millis(
          serverSeconds === undefined
            ? cappedBackoff
            : Math.max(cappedBackoff, serverSeconds * 1_000),
        );
      }),
    ),
    Schedule.while(
      ({ input, elapsed, duration }) =>
        isRetryableRegistryError(input) &&
        elapsed + Duration.toMillis(duration) <= totalDeadlineMillis,
    ),
    Schedule.upTo({ times: Math.max(0, policy.maxAttempts - 1) }),
    Schedule.tap(({ attempt, duration, input }) =>
      Effect.logDebug("Retrying Registry request", {
        service: "registry",
        operation,
        nextAttempt: attempt + 1,
        delayMillis: Duration.toMillis(duration),
        ...(requestIdFromError(input) === undefined
          ? {}
          : { requestId: requestIdFromError(input) }),
      }),
    ),
  );
};

const isReplaySafe = (safety: RegistryRequestReplaySafety): boolean =>
  safety.kind === "safe" ||
  (safety.kind === "idempotency-keyed" && safety.idempotencyKey.length > 0);

const retryStopReason = (args: {
  readonly retryable: boolean;
  readonly replaySafe: boolean;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly deadlineExpired: boolean;
}): "attempt-limit" | "deadline" | "replay-unsafe" | undefined => {
  if (!args.retryable) return undefined;
  if (!args.replaySafe) return "replay-unsafe";
  if (args.deadlineExpired || args.attemptCount < args.maxAttempts) return "deadline";
  return "attempt-limit";
};

const withRequestPolicyMetadata = (
  error: AppError,
  args: {
    readonly request: NonNullable<AppErrorMetadata["request"]>;
    readonly replaySafety: RegistryRequestReplaySafety;
    readonly attemptCount: number;
    readonly maxAttempts: number;
    readonly retryable: boolean;
    readonly deadlineExpired: boolean;
  },
): AppError => {
  const replaySafe = isReplaySafe(args.replaySafety);
  const stoppedBy = retryStopReason({
    retryable: args.retryable,
    replaySafe,
    attemptCount: args.attemptCount,
    maxAttempts: args.maxAttempts,
    deadlineExpired: args.deadlineExpired,
  });
  return makeAppError({
    code: error.code,
    title: error.title,
    detail: error.detail,
    metadata: {
      ...error.metadata,
      request: error.metadata?.request ?? args.request,
      requestPolicy: {
        retryable: args.retryable,
        attemptCount: args.attemptCount,
        maxAttempts: replaySafe ? args.maxAttempts : 1,
        exhausted: args.retryable,
        ...(stoppedBy === undefined ? {} : { stoppedBy }),
        replaySafety: args.replaySafety.kind,
      },
    },
    ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
    ...(error.action === undefined ? {} : { action: error.action }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });
};

export const executeRegistryRequest = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  args: {
    readonly operation: string;
    readonly request: NonNullable<AppErrorMetadata["request"]>;
    readonly replaySafety: RegistryRequestReplaySafety;
    readonly mapError: (error: E) => AppError;
    readonly policy?: RegistryRequestPolicy;
  },
): Effect.Effect<A, AppError, R> => {
  const policy = args.policy ?? DEFAULT_REGISTRY_REQUEST_POLICY;
  const maxAttempts = Math.max(1, policy.maxAttempts);
  const attempt = effect.pipe(Effect.timeout(policy.requestTimeout));

  return Effect.gen(function* () {
    const attempts = yield* Ref.make(0);
    const countedAttempt = Ref.update(attempts, (count) => count + 1).pipe(Effect.andThen(attempt));
    const executed = isReplaySafe(args.replaySafety)
      ? countedAttempt.pipe(Effect.retry(retrySchedule(policy, args.operation)))
      : countedAttempt;

    return yield* executed.pipe(
      Effect.timeout(policy.totalDeadline),
      Effect.catch((error) =>
        Ref.get(attempts).pipe(
          Effect.tap((attemptCount) =>
            Effect.logDebug("Registry request finished with an error", {
              service: "registry",
              operation: args.operation,
              attemptCount,
              replaySafety: args.replaySafety.kind,
              ...(requestIdFromError(error) === undefined
                ? {}
                : { requestId: requestIdFromError(error) }),
            }),
          ),
          Effect.flatMap((attemptCount) => {
            const deadlineExpired = Cause.isTimeoutError(error);
            const mapped = deadlineExpired
              ? makeAppError({
                  code: "timeout",
                  detail: "Registry request did not complete within the configured deadline.",
                  metadata: { request: args.request },
                  cause: error,
                })
              : args.mapError(error);
            return Effect.fail(
              withRequestPolicyMetadata(mapped, {
                request: args.request,
                replaySafety: args.replaySafety,
                attemptCount,
                maxAttempts,
                retryable: deadlineExpired || isRetryableRegistryError(error),
                deadlineExpired,
              }),
            );
          }),
        ),
      ),
    );
  });
};
