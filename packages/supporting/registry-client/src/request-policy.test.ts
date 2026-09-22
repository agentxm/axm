import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";

import { RegistryClientError } from "./__generated__/registry-client.js";
import { RegistryRequestFailed, type RegistryRequestMetadata } from "./errors.js";
import {
  executeRegistryRequest,
  PUBLISH_REGISTRY_REQUEST_POLICY,
  RegistryRequestAttempt,
  OperationRequestBudget,
  RegistryRetryObservation,
  makeOperationRequestBudget,
  type RegistryRequestPolicy,
  type RegistryRequestReplaySafety,
} from "./request-policy.js";

const request = HttpClientRequest.get("https://registry.agentxm.ai/v1/extensions");
const requestMetadata: RegistryRequestMetadata = {
  service: "registry",
  method: "GET",
  url: "https://registry.agentxm.ai/v1/extensions",
};

const policy = (overrides?: Partial<RegistryRequestPolicy>): RegistryRequestPolicy => ({
  requestTimeout: "10 seconds",
  totalDeadline: "30 seconds",
  maxAttempts: 3,
  initialBackoff: "0 millis",
  maxBackoff: "10 seconds",
  ...overrides,
});

const mapError = (error: unknown) =>
  new RegistryRequestFailed({
    category: "network",
    detail: "Registry request failed.",
    cause: error,
  });

const execute = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options?: {
    readonly replaySafety?: RegistryRequestReplaySafety;
    readonly policy?: RegistryRequestPolicy;
  },
) =>
  executeRegistryRequest(effect, {
    operation: "test",
    request: requestMetadata,
    replaySafety: options?.replaySafety ?? { kind: "safe" },
    mapError,
    policy: options?.policy ?? policy(),
  });

const transportError = () =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request,
      cause: new Error("ECONNRESET"),
      description: "Connection reset",
    }),
  });

const responseError = (status: number, args?: { retryAfter?: string; bodyDelay?: number }) => {
  const response = HttpClientResponse.fromWeb(
    request,
    new Response(undefined, {
      status,
      headers: args?.retryAfter === undefined ? {} : { "retry-after": args.retryAfter },
    }),
  );
  const cause = {
    type: "about:blank",
    title: "Retry later",
    status,
    detail: "The Registry is temporarily unavailable.",
    code: "registry/retry-later",
    details: {
      retryable: true,
      ...(args?.bodyDelay === undefined ? {} : { retryAfterSeconds: args.bodyDelay }),
    },
  };
  return RegistryClientError(`Test${status}`, cause, response);
};

describe("executeRegistryRequest", () => {
  it.effect("admits another origin while one origin is at capacity", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationRequestBudget({ invocation: 2, origin: 1 });
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const sameOriginStarted = yield* Ref.make(false);
      const otherOriginStarted = yield* Deferred.make<void>();

      const first = yield* budget
        .withAttempt(
          "https://registry-one.test",
          Deferred.succeed(firstStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseFirst)),
          ),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(firstStarted);

      const sameOrigin = yield* budget
        .withAttempt("https://registry-one.test", Ref.set(sameOriginStarted, true))
        .pipe(Effect.forkChild);
      const otherOrigin = yield* budget
        .withAttempt("https://registry-two.test", Deferred.succeed(otherOriginStarted, undefined))
        .pipe(Effect.forkChild);

      yield* Deferred.await(otherOriginStarted);
      expect(yield* Ref.get(sameOriginStarted)).toBe(false);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(sameOrigin);
      yield* Fiber.join(otherOrigin);
      expect(yield* Ref.get(sameOriginStarted)).toBe(true);
    }),
  );

  it.effect("holds a shared request permit until the response body completes", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationRequestBudget({ invocation: 1, origin: 1 });
      const bodyStarted = yield* Deferred.make<void>();
      const releaseBody = yield* Deferred.make<void>();
      const secondStarted = yield* Ref.make(false);

      const first = yield* execute(
        Deferred.succeed(bodyStarted, undefined).pipe(
          Effect.andThen(Deferred.await(releaseBody)),
          Effect.as("first"),
        ),
      ).pipe(Effect.provideService(OperationRequestBudget, budget), Effect.forkChild);
      yield* Deferred.await(bodyStarted);

      const second = yield* execute(Ref.set(secondStarted, true).pipe(Effect.as("second"))).pipe(
        Effect.provideService(OperationRequestBudget, budget),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      expect(yield* Ref.get(secondStarted)).toBe(false);

      yield* Deferred.succeed(releaseBody, undefined);
      expect(yield* Fiber.join(first)).toBe("first");
      expect(yield* Fiber.join(second)).toBe("second");
      expect(yield* Ref.get(secondStarted)).toBe(true);
    }),
  );

  it.effect("releases the request permit while a retry waits", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationRequestBudget({ invocation: 1, origin: 1 });
      const retryWaiting = yield* Deferred.make<void>();
      const attempts = yield* Ref.make(0);
      const first = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1
              ? Effect.fail(responseError(429, { bodyDelay: 2 }))
              : Effect.succeed("done"),
          ),
        ),
      ).pipe(
        Effect.provideService(OperationRequestBudget, budget),
        Effect.provideService(RegistryRetryObservation, {
          waiting: () => Deferred.succeed(retryWaiting, undefined),
          ended: () => Effect.void,
        }),
        Effect.forkChild,
      );

      yield* Deferred.await(retryWaiting);
      expect(
        yield* execute(Effect.succeed("other")).pipe(
          Effect.provideService(OperationRequestBudget, budget),
        ),
      ).toBe("other");
      yield* TestClock.adjust("2 seconds");
      expect(yield* Fiber.join(first)).toBe("done");
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it("gives publish one long attempt without transport replay", () => {
    expect(PUBLISH_REGISTRY_REQUEST_POLICY).toMatchObject({
      requestTimeout: "5 minutes",
      totalDeadline: "5 minutes",
      maxAttempts: 1,
    });
  });

  it.effect("returns a successful first attempt without replaying it", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const result = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(Effect.as("ok")),
      );

      expect(result).toBe("ok");
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );

  it.effect("retries a replay-safe transport failure", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const result = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1 ? Effect.fail(transportError()) : Effect.succeed("ok"),
          ),
        ),
      );

      expect(result).toBe("ok");
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it.effect("does not replay a request the transport already refused for a typed reason", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const refused = new RegistryRequestFailed({
        category: "auth",
        detail: "Your session could not be renewed: Could not lock the session for refresh",
      });
      yield* execute(
        Ref.update(attempts, (count) => count + 1).pipe(
          Effect.andThen(
            Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({ request, cause: refused }),
              }),
            ),
          ),
        ),
      ).pipe(Effect.flip);

      // Asking again cannot change why the request never left.
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );

  it.effect("tells each attempt which attempt it is and how many it may take", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<{ n: number; of: number }>>([]);
      const record = Effect.flatMap(RegistryRequestAttempt, (attempt) =>
        Ref.update(seen, (all) => [...all, attempt]),
      );
      const attempts = yield* Ref.make(0);

      const result = yield* execute(
        record.pipe(
          Effect.andThen(Ref.updateAndGet(attempts, (count) => count + 1)),
          Effect.flatMap((attempt) =>
            attempt === 1 ? Effect.fail(transportError()) : Effect.succeed("ok"),
          ),
        ),
      );

      expect(result).toBe("ok");
      expect(yield* Ref.get(seen)).toEqual([
        { n: 1, of: 3 },
        { n: 2, of: 3 },
      ]);
    }),
  );

  it.effect("tells a request it will not replay that it has one attempt", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<{ n: number; of: number }>>([]);
      const record = Effect.flatMap(RegistryRequestAttempt, (attempt) =>
        Ref.update(seen, (all) => [...all, attempt]),
      );

      yield* execute(record.pipe(Effect.as("ok")), { replaySafety: { kind: "mutation" } });

      expect(yield* Ref.get(seen)).toEqual([{ n: 1, of: 1 }]);
    }),
  );

  it.effect("stops after the configured attempt bound", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const error = yield* execute(
        Ref.update(attempts, (count) => count + 1).pipe(
          Effect.andThen(Effect.fail(transportError())),
        ),
      ).pipe(Effect.flip);

      expect(error.category).toBe("network");
      expect(yield* Ref.get(attempts)).toBe(3);
    }),
  );

  it.effect("honors typed 429 retry guidance before the next attempt", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const fiber = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1
              ? Effect.fail(responseError(429, { bodyDelay: 2 }))
              : Effect.succeed("ok"),
          ),
        ),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      expect(yield* Ref.get(attempts)).toBe(1);
      yield* TestClock.adjust("1999 millis");
      expect(yield* Ref.get(attempts)).toBe(1);
      yield* TestClock.adjust("1 millis");

      expect(yield* Fiber.join(fiber)).toBe("ok");
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it.effect("announces the actual retry delay and clears it before the next attempt", () =>
    Effect.gen(function* () {
      const announced = yield* Deferred.make<{
        readonly nextAttempt: number;
        readonly maxAttempts: number;
        readonly delayMillis: number;
      }>();
      const ended = yield* Ref.make(0);
      const attempts = yield* Ref.make(0);
      const fiber = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1
              ? Effect.fail(responseError(429, { bodyDelay: 2 }))
              : Effect.succeed("ok"),
          ),
        ),
      ).pipe(
        Effect.provideService(RegistryRetryObservation, {
          waiting: (retry) => Deferred.succeed(announced, retry),
          ended: () => Ref.update(ended, (count) => count + 1),
        }),
        Effect.forkChild,
      );

      expect(yield* Deferred.await(announced)).toMatchObject({
        operation: "test",
        nextAttempt: 2,
        maxAttempts: 3,
        delayMillis: 2_000,
      });
      expect(yield* Ref.get(ended)).toBe(0);
      yield* TestClock.adjust("2 seconds");
      expect(yield* Fiber.join(fiber)).toBe("ok");
      expect(yield* Ref.get(attempts)).toBe(2);
      expect(yield* Ref.get(ended)).toBe(1);
    }),
  );

  it.effect("honors a 503 Retry-After header before the next attempt", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const fiber = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1
              ? Effect.fail(responseError(503, { retryAfter: "3" }))
              : Effect.succeed("ok"),
          ),
        ),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* TestClock.adjust("2999 millis");
      expect(yield* Ref.get(attempts)).toBe(1);
      yield* TestClock.adjust("1 millis");

      expect(yield* Fiber.join(fiber)).toBe("ok");
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it.effect("does not replay a mutation after a transient failure", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const error = yield* execute(
        Ref.update(attempts, (count) => count + 1).pipe(
          Effect.andThen(Effect.fail(transportError())),
        ),
        { replaySafety: { kind: "mutation" } },
      ).pipe(Effect.flip);

      expect(error.category).toBe("network");
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );

  it.effect("replays the exact idempotency-keyed mutation", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const mutationRequest = {
        idempotencyKey: "publish-01JABC",
        body: new Uint8Array([1, 2, 3]),
      };
      const observedRequests = yield* Ref.make<ReadonlyArray<typeof mutationRequest>>([]);
      const result = yield* execute(
        Ref.updateAndGet(attempts, (count) => count + 1).pipe(
          Effect.tap(() =>
            Ref.update(observedRequests, (requests) => [...requests, mutationRequest]),
          ),
          Effect.flatMap((attempt) =>
            attempt === 1 ? Effect.fail(transportError()) : Effect.succeed("published"),
          ),
        ),
        {
          replaySafety: {
            kind: "idempotency-keyed",
            idempotencyKey: mutationRequest.idempotencyKey,
          },
        },
      );

      expect(result).toBe("published");
      const requests = yield* Ref.get(observedRequests);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toBe(mutationRequest);
      expect(requests[1]).toBe(mutationRequest);
    }),
  );

  it.effect("maps a per-request timeout to a stable typed failure", () =>
    Effect.gen(function* () {
      const fiber = yield* execute(Effect.never, {
        replaySafety: { kind: "mutation" },
        policy: policy({ requestTimeout: "1 second", totalDeadline: "5 seconds" }),
      }).pipe(Effect.flip, Effect.forkChild);

      yield* TestClock.adjust("1 second");
      const error = yield* Fiber.join(fiber);

      expect(error.category).toBe("timeout");
      expect(error._tag).toBe("RegistryRequestFailed");
      expect(error.detail).toBe(
        "Registry request did not complete within the configured deadline.",
      );
      expect(error.metadata?.request).toEqual(requestMetadata);
      expect(error.metadata?.requestPolicy).toEqual({
        retryable: true,
        attemptCount: 1,
        maxAttempts: 1,
        exhausted: true,
        stoppedBy: "replay-unsafe",
        replaySafety: "mutation",
      });
    }),
  );

  it.effect("bounds all attempts by the total deadline", () =>
    Effect.gen(function* () {
      const fiber = yield* execute(Effect.never, {
        policy: policy({ requestTimeout: "10 seconds", totalDeadline: "2 seconds" }),
      }).pipe(Effect.flip, Effect.forkChild);

      yield* TestClock.adjust("2 seconds");
      const error = yield* Fiber.join(fiber);

      expect(error.category).toBe("timeout");
      expect(error.metadata?.request).toEqual(requestMetadata);
      expect(error.metadata?.requestPolicy).toMatchObject({
        retryable: true,
        attemptCount: 1,
        maxAttempts: 3,
        exhausted: true,
        stoppedBy: "deadline",
        replaySafety: "safe",
      });
    }),
  );

  it.effect("preserves cancellation during an in-flight request", () =>
    Effect.gen(function* () {
      const interruptions = yield* Ref.make(0);
      const fiber = yield* execute(
        Effect.never.pipe(
          Effect.onInterrupt(() => Ref.update(interruptions, (count) => count + 1)),
        ),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);

      expect(yield* Ref.get(interruptions)).toBe(1);
    }),
  );

  it.effect("preserves cancellation during retry backoff", () =>
    Effect.gen(function* () {
      const attempted = yield* Deferred.make<void>();
      const waiting = yield* Deferred.make<void>();
      const attempts = yield* Ref.make(0);
      const ended = yield* Ref.make(0);
      const fiber = yield* execute(
        Ref.update(attempts, (count) => count + 1).pipe(
          Effect.andThen(Deferred.succeed(attempted, undefined)),
          Effect.andThen(Effect.fail(responseError(503, { retryAfter: "10" }))),
        ),
      ).pipe(
        Effect.provideService(RegistryRetryObservation, {
          waiting: () => Deferred.succeed(waiting, undefined),
          ended: () => Ref.update(ended, (count) => count + 1),
        }),
        Effect.forkChild,
      );

      yield* Deferred.await(attempted);
      yield* Deferred.await(waiting);
      yield* Fiber.interrupt(fiber);
      yield* TestClock.adjust("10 seconds");

      expect(yield* Ref.get(attempts)).toBe(1);
      expect(yield* Ref.get(ended)).toBe(1);
    }),
  );
});
