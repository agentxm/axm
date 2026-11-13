import { RegistryAuthorityContext } from "./index.js";
import {
  CurrentWorkObserver,
  type WorkFact,
  type WorkObserver,
} from "@agentxm/host-primitives/work-observation";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Scheduler from "effect/Scheduler";
import * as Tracer from "effect/Tracer";
import { RegistryOperationFailed } from "./index.js";
import { testRegistryEndpoint } from "./testing.js";
import { extensionName, handle } from "./test-helpers.js";
import { makeRegistryReadPhase } from "./read-phase.js";

for (const detail of [false, true]) {
  it.effect(
    `counts actual metadata lookup starts under scheduler interleaving (detail=${detail})`,
    () =>
      Effect.gen(function* () {
        const observations = workObservations(detail);
        let lookups = 0;
        const results = yield* Effect.gen(function* () {
          const memo = yield* makeRegistryReadPhase(
            () =>
              Effect.succeed(new RegistryAuthorityContext({ id: "test-authority", generation: 0 })),
            () =>
              Effect.sync(() => {
                lookups += 1;
                return Option.none();
              }),
          );
          const get = memo.get(testRegistryEndpoint, {
            owner: handle("@private-owner"),
            type: "skill",
            name: extensionName("private-input"),
          });
          // A small scheduler budget permits another real requester to populate
          // the cache between observing its entry and executing Cache.get.
          return yield* Effect.all(
            Array.from({ length: 16 }, () => get),
            { concurrency: 16 },
          );
        }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 1), observations.provide);
        expect(results).toEqual(Array.from({ length: 16 }, () => Option.none()));
        expect(lookups).toBe(1);
        const requests = observations.facts.filter(
          (fact) => fact.kind === "axm.registry.metadata-reuse",
        );
        expect(requests).toHaveLength(16);
        expect(
          requests.reduce((total, fact) => total + (fact.attributes["axm.work.executed"] ?? 0), 0),
        ).toBe(lookups);
        expect(
          requests.reduce(
            (total, fact) => total + (fact.attributes["axm.work.reused-count"] ?? 0),
            0,
          ),
        ).toBe(15);
        expect(
          requests.filter((fact) => fact.attributes["axm.cache.outcome"] === "miss"),
        ).toHaveLength(1);
        expect(requests.every((fact) => fact.outcome === "success")).toBe(true);
      }),
  );
}

it.effect(
  "reports metadata lookup misses, shared in-flight work, hits and failed-read retries",
  () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let lookups = 0;
      let failures = 0;
      yield* Effect.gen(function* () {
        const memo = yield* makeRegistryReadPhase(
          () =>
            Effect.succeed(new RegistryAuthorityContext({ id: "test-authority", generation: 0 })),
          () =>
            Effect.gen(function* () {
              lookups += 1;
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              return Option.none();
            }),
        );
        const args = {
          owner: handle("@private-owner"),
          type: "skill" as const,
          name: extensionName("private-input"),
        };
        const get = memo.get(testRegistryEndpoint, args);
        const first = yield* get.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(started);
        const cancelled = yield* get.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Fiber.interrupt(cancelled);
        expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true);
        const second = yield* get.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(first)).toEqual(Option.none());
        expect(yield* Fiber.join(second)).toEqual(Option.none());
        expect(yield* get).toEqual(Option.none());
        const failing = yield* makeRegistryReadPhase(
          () =>
            Effect.succeed(new RegistryAuthorityContext({ id: "test-authority", generation: 0 })),
          () =>
            Effect.suspend(() => {
              failures += 1;
              return Effect.fail(
                new RegistryOperationFailed({ category: "network", detail: "private-failure" }),
              );
            }),
        );
        yield* failing.get(testRegistryEndpoint, args).pipe(Effect.result);
        yield* failing.get(testRegistryEndpoint, args).pipe(Effect.result);
        // Missing trace context cannot introduce a product failure.
        expect(yield* get.pipe(Effect.withTracerEnabled(false))).toEqual(Option.none());
      }).pipe(withDetailedWork(tracer));
      const requests = spans.filter((span) => span.name === "axm.registry.metadata-reuse");
      expect(lookups).toBe(1);
      expect(failures).toBe(2);
      expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
        "miss",
        "coalesced",
        "coalesced",
        "hit",
        "miss",
        "miss",
      ]);
      expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
        1, 0, 0, 0, 1, 1,
      ]);
      expect(requests.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
        0, 0, 1, 1, 0, 0,
      ]);
      expect(JSON.stringify(requests.map((span) => [...span.attributes]))).not.toContain("private");
    }).pipe(Effect.scoped),
);

/** Owner-local observations; independent fixtures still determine the expected work. */
const workObservations = (detail: boolean) => {
  const facts: WorkFact[] = [];
  const observer: WorkObserver = {
    record: (fact) => {
      facts.push(fact);
    },
    detailSelected: () => detail,
  };
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, CurrentWorkObserver, observer);
  return { facts, observer, provide };
};

/** Explicitly select detail when a test verifies real span lifetime or attributes. */
const withDetailedWork =
  (tracer: Tracer.Tracer) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(workObservations(true).provide, Effect.withTracer(tracer));
