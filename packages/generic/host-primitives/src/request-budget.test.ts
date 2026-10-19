import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import { makeOperationRequestBudget } from "./request-budget.js";

describe("OperationRequestBudget", () => {
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
});
