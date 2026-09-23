import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as RcMap from "effect/RcMap";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import type * as Scope from "effect/Scope";

import {
  isAnyRegistryClientError,
  isHttpClientError,
  isTransientTransportError,
} from "./error-mapping.js";
import {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
  type RegistryClientFailure,
  type RegistryErrorMetadata,
  type RegistryRequestMetadata,
} from "./errors.js";
import { registryRetryAfterSeconds } from "./retry-after.js";

/**
 * The attempt in flight, provided to the attempted effect so work inside a
 * retried request can report which attempt produced its measurements. Absent
 * outside a policy-governed request.
 */
export class RegistryRequestAttempt extends ServiceMap.Service<
  RegistryRequestAttempt,
  { readonly n: number; readonly of: number }
>()("@agentxm/registry-client/request-policy/RegistryRequestAttempt") {}

export interface RegistryRequestPolicy {
  readonly requestTimeout: Duration.Input;
  readonly totalDeadline: Duration.Input;
  readonly maxAttempts: number;
  readonly initialBackoff: Duration.Input;
  readonly maxBackoff: Duration.Input;
}

/** One request's scheduled retry, with a stable identity across its wait. */
export interface RegistryRetryWait {
  readonly requestId: string;
  readonly operation: string;
  readonly nextAttempt: number;
  readonly maxAttempts: number;
  readonly delayMillis: number;
}

/** Optional operation-scoped observation for all policy-governed Registry requests. */
export class RegistryRetryObservation extends ServiceMap.Service<
  RegistryRetryObservation,
  {
    readonly waiting: (retry: RegistryRetryWait) => Effect.Effect<void>;
    readonly ended: (requestId: string) => Effect.Effect<void>;
  }
>()("@agentxm/registry-client/request-policy/RegistryRetryObservation") {}

export interface OperationRequestBudgetService {
  readonly capacity: number;
  readonly withAttempt: <A, E, R>(
    origin: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/** Shared by all Registry reads and downloads in one CLI operation. */
export class OperationRequestBudget extends ServiceMap.Service<
  OperationRequestBudget,
  OperationRequestBudgetService
>()("@agentxm/registry-client/request-policy/OperationRequestBudget") {}

export const makeOperationRequestBudget = (limits: {
  readonly invocation: number;
  readonly origin: number;
}): Effect.Effect<OperationRequestBudgetService, never, Scope.Scope> =>
  Effect.gen(function* () {
    if (
      !Number.isSafeInteger(limits.invocation) ||
      limits.invocation < 1 ||
      !Number.isSafeInteger(limits.origin) ||
      limits.origin < 1
    ) {
      return yield* Effect.die(new Error("Request limits must be positive finite integers"));
    }
    const invocation = yield* Semaphore.make(limits.invocation);
    // Borrow before waiting: the last active request cannot retire an origin
    // while another request for that origin is queued for its permit.
    const origins = yield* RcMap.make({
      lookup: (_origin: string) => Semaphore.make(limits.origin),
    });
    return {
      capacity: limits.invocation,
      withAttempt: (origin, effect) =>
        Effect.scoped(
          Effect.flatMap(RcMap.get(origins, origin), (originSemaphore) =>
            originSemaphore.withPermit(invocation.withPermit(effect)),
          ),
        ),
    } satisfies OperationRequestBudgetService;
  });

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
    if (error.reason._tag === "TransportError") return isTransientTransportError(error);
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

const retrySchedule = (
  policy: RegistryRequestPolicy,
  operation: string,
  onRetryWaiting?: (
    retry: Pick<RegistryRetryWait, "nextAttempt" | "maxAttempts" | "delayMillis">,
  ) => Effect.Effect<void>,
) => {
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
      }).pipe(
        Effect.andThen(
          onRetryWaiting === undefined
            ? Effect.void
            : onRetryWaiting({
                nextAttempt: attempt + 1,
                maxAttempts: policy.maxAttempts,
                delayMillis: Duration.toMillis(duration),
              }),
        ),
      ),
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
  error: RegistryClientFailure,
  args: {
    readonly request: RegistryRequestMetadata;
    readonly replaySafety: RegistryRequestReplaySafety;
    readonly attemptCount: number;
    readonly maxAttempts: number;
    readonly retryable: boolean;
    readonly deadlineExpired: boolean;
  },
): RegistryClientFailure => {
  const replaySafe = isReplaySafe(args.replaySafety);
  const stoppedBy = retryStopReason({
    retryable: args.retryable,
    replaySafe,
    attemptCount: args.attemptCount,
    maxAttempts: args.maxAttempts,
    deadlineExpired: args.deadlineExpired,
  });
  const metadata: RegistryErrorMetadata = {
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
  };
  switch (error._tag) {
    case "RegistryProblem":
      return new RegistryProblem({
        category: error.category,
        ...(error.title === undefined ? {} : { title: error.title }),
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        metadata,
        ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
        cause: error.cause,
      });
    case "RegistryRequestFailed":
      return new RegistryRequestFailed({
        category: error.category,
        detail: error.detail,
        metadata,
        ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
    case "RegistryOperationFailed":
      return new RegistryOperationFailed({
        category: error.category,
        detail: error.detail,
        metadata,
        ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
  }
};

export const executeRegistryRequest = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  args: {
    readonly operation: string;
    readonly request: RegistryRequestMetadata;
    readonly replaySafety: RegistryRequestReplaySafety;
    readonly mapError: (error: E) => RegistryClientFailure;
    readonly policy?: RegistryRequestPolicy;
  },
  // The policy owns the attempt, so it satisfies the service the governed work
  // reads rather than leaving it for the caller to provide.
): Effect.Effect<A, RegistryClientFailure, Exclude<R, RegistryRequestAttempt>> => {
  const policy = args.policy ?? DEFAULT_REGISTRY_REQUEST_POLICY;
  const maxAttempts = Math.max(1, policy.maxAttempts);
  const replaySafe = isReplaySafe(args.replaySafety);
  // A request the policy will not replay gets exactly one attempt, whatever
  // the policy allows, and says so to the work it governs.
  const attemptLimit = replaySafe ? maxAttempts : 1;
  return Effect.gen(function* () {
    const attempts = yield* Ref.make(0);
    const waiting = yield* Ref.make(false);
    const budget = yield* Effect.serviceOption(OperationRequestBudget);
    const attempt = Option.match(budget, {
      onNone: () => effect.pipe(Effect.timeout(policy.requestTimeout)),
      onSome: (service) =>
        service.withAttempt(
          new URL(args.request.url).origin,
          effect.pipe(Effect.timeout(policy.requestTimeout)),
        ),
    });
    const retrySession = Option.match(yield* Effect.serviceOption(RegistryRetryObservation), {
      onNone: () => undefined,
      onSome: (observer) => ({ observer, requestId: globalThis.crypto.randomUUID() }),
    });
    const endRetryWait = Effect.uninterruptible(
      Ref.getAndSet(waiting, false).pipe(
        Effect.flatMap((wasWaiting) =>
          wasWaiting && retrySession !== undefined
            ? retrySession.observer.ended(retrySession.requestId)
            : Effect.void,
        ),
      ),
    );
    const countedAttempt = Ref.updateAndGet(attempts, (count) => count + 1).pipe(
      Effect.flatMap((n) =>
        endRetryWait.pipe(
          Effect.andThen(
            Effect.provideService(attempt, RegistryRequestAttempt, { n, of: attemptLimit }),
          ),
        ),
      ),
    );
    const onRetryWaiting =
      retrySession === undefined
        ? undefined
        : (retry: Pick<RegistryRetryWait, "nextAttempt" | "maxAttempts" | "delayMillis">) =>
            Effect.uninterruptible(
              retrySession.observer
                .waiting({ ...retry, requestId: retrySession.requestId, operation: args.operation })
                .pipe(Effect.andThen(Ref.set(waiting, true))),
            );
    const executed = replaySafe
      ? countedAttempt.pipe(Effect.retry(retrySchedule(policy, args.operation, onRetryWaiting)))
      : countedAttempt;

    return yield* executed.pipe(
      Effect.ensuring(endRetryWait),
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
              ? new RegistryRequestFailed({
                  category: "timeout",
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
