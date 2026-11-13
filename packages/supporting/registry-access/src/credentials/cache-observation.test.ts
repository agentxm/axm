import { expect, it } from "@effect/vitest";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import * as Cache from "effect/Cache";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { credentialCacheLookupStarted, observeCredentialCache } from "./cache-observation.js";
import { recordTrace } from "../test-support/test-helpers.js";

for (const cancelFollower of [false, true]) {
  it.effect(
    `distinguishes a completed hit from ${cancelFollower ? "cancelled" : "completed"} shared work`,
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const following = yield* Deferred.make<void>();
        const facts: WorkFact[] = [];
        let calls = 0;
        let requests = 0;
        const trace = recordTrace((span) => {
          if (span.name === "axm.auth.cache" && ++requests === 2)
            Deferred.doneUnsafe(following, Effect.void);
        });
        const cache = yield* Cache.makeWith(
          (_key: string) =>
            credentialCacheLookupStarted.pipe(
              Effect.andThen(
                Effect.gen(function* () {
                  calls += 1;
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return "fixture-value";
                }),
              ),
            ),
          { capacity: 1, timeToLive: () => Duration.infinity },
        );
        yield* Effect.gen(function* () {
          const load = observeCredentialCache("stored-session", cache, "fixture-key");
          const leader = yield* load.pipe(Effect.forkChild);
          yield* Deferred.await(started);
          const follower = yield* load.pipe(Effect.forkChild);
          yield* Deferred.await(following);
          if (cancelFollower) yield* Fiber.interrupt(follower);
          yield* Deferred.succeed(release, undefined);
          expect(yield* Fiber.join(leader)).toBe("fixture-value");
          if (!cancelFollower) expect(yield* Fiber.join(follower)).toBe("fixture-value");
          expect(yield* load).toBe("fixture-value");
        }).pipe(
          Effect.provideService(CurrentWorkObserver, {
            record: (fact) => {
              facts.push(fact);
            },
            detailSelected: () => true,
          }),
          Effect.withTracer(trace.tracer),
          Effect.withTracerEnabled(true),
        );
        expect(calls).toBe(1);
        expect(facts).toHaveLength(3);
        expect(
          facts.reduce((total, fact) => total + (fact.attributes["axm.work.reused-count"] ?? 0), 0),
        ).toBe(cancelFollower ? 1 : 2);
        const spans = trace.spans.filter((span) => span.name === "axm.auth.cache");
        expect(spans.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
          "miss",
          "coalesced",
          "hit",
        ]);
        expect(spans.map((span) => span.attributes.get("axm.work.executed"))).toEqual([1, 0, 0]);
        expect(spans.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
          0,
          cancelFollower ? 0 : 1,
          1,
        ]);
        expect(spans.map((span) => trace.endCounts.get(span.spanId))).toEqual([1, 1, 1]);
        const follower = spans[1];
        expect(follower?.status._tag === "Ended" && Exit.hasInterrupts(follower.status.exit)).toBe(
          cancelFollower,
        );
      }),
  );
}

it.effect("counts a delivered cached failure as reuse without another lookup", () =>
  Effect.gen(function* () {
    let calls = 0;
    const trace = recordTrace();
    const facts: WorkFact[] = [];
    const cache = yield* Cache.makeWith(
      (_key: string) =>
        credentialCacheLookupStarted.pipe(
          Effect.andThen(
            Effect.sync(() => {
              calls += 1;
            }),
          ),
          Effect.andThen(Effect.fail("fixture-failure")),
        ),
      { capacity: 1, timeToLive: () => Duration.infinity },
    );
    yield* Effect.gen(function* () {
      for (let i = 0; i < 2; i++)
        expect(
          yield* observeCredentialCache("workload", cache, "fixture-key").pipe(Effect.flip),
        ).toBe("fixture-failure");
    }).pipe(
      Effect.provideService(CurrentWorkObserver, {
        record: (fact) => {
          facts.push(fact);
        },
        detailSelected: () => true,
      }),
      Effect.withTracer(trace.tracer),
      Effect.withTracerEnabled(true),
    );
    expect(calls).toBe(1);
    expect(facts.map((fact) => fact.outcome)).toEqual(["failure", "failure"]);
    expect(facts.map((fact) => fact.attributes["axm.work.reused-count"])).toEqual([0, 1]);
    const spans = trace.spans.filter((span) => span.name === "axm.auth.cache");
    expect(spans.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual(["miss", "hit"]);
    expect(spans.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([0, 1]);
  }),
);
