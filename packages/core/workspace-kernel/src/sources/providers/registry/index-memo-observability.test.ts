import { withDetailedWork, workObservations } from "../../../locations/testing.js";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Scheduler from "effect/Scheduler";
import * as Tracer from "effect/Tracer";
import { RegistryOperationFailed } from "@agentxm/registry-client";
import { testRegistryEndpoint } from "@agentxm/registry-client/testing";
import { extensionName, handle } from "../../test-helpers.js";
import { makeRegistryIndexMemo } from "./index-memo.js";

for (const detail of [false, true]) {
  it.effect(
    `counts actual metadata lookup starts under scheduler interleaving (detail=${detail})`,
    () =>
      Effect.gen(function* () {
        const observations = workObservations(detail);
        let lookups = 0;
        const results = yield* Effect.gen(function* () {
          const memo = yield* makeRegistryIndexMemo(() =>
            Effect.sync(() => {
              lookups += 1;
              return Option.none();
            }),
          );
          const get = memo.get(testRegistryEndpoint, "private-source", {
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
        const memo = yield* makeRegistryIndexMemo(() =>
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
        const get = memo.get(testRegistryEndpoint, "private-source", args);
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
        const failing = yield* makeRegistryIndexMemo(() =>
          Effect.suspend(() => {
            failures += 1;
            return Effect.fail(
              new RegistryOperationFailed({ category: "network", detail: "private-failure" }),
            );
          }),
        );
        yield* failing.get(testRegistryEndpoint, "private-source", args).pipe(Effect.result);
        yield* failing.get(testRegistryEndpoint, "private-source", args).pipe(Effect.result);
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
