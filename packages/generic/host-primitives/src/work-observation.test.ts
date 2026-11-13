import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Tracer from "effect/Tracer";
import {
  annotateWork,
  captureWork,
  CurrentWorkObserver,
  recordWork,
  withWork,
  type WorkFact,
  type WorkObserver,
} from "./work-observation.js";

// The observer is the runtime port. These tests establish producer accounting and
// context behavior; receiver delivery and aggregate admission belong to the CLI.
const observation = (detail = false) => {
  const records: Array<{ readonly fact: WorkFact; readonly parent: Tracer.AnySpan | undefined }> =
    [];
  const spans: Array<Tracer.Span> = [];
  const observer: WorkObserver = {
    record: (fact, parent) => {
      records.push({ fact, parent });
    },
    detailSelected: () => detail,
  };
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { observer, records, spans, tracer };
};

describe("direct work observation", () => {
  it.effect("bypasses clocks, detail spans and annotations without an invocation observer", () =>
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      const observed = observation(true);
      let reads = 0;
      const countingClock: Clock.Clock = {
        ...clock,
        currentTimeNanosUnsafe: () => {
          reads += 1;
          return 1n;
        },
        monotonicTimeNanosUnsafe: () => {
          reads += 1;
          return 1n;
        },
      };
      const result = yield* Effect.gen(function* () {
        expect(yield* captureWork).toBeUndefined();
        yield* recordWork({ kind: "axm.hash.content", attributes: {}, outcome: "success" });
        return yield* withWork(
          "axm.io.read-file",
          annotateWork({ "axm.io.bytes": 7 }).pipe(Effect.as("product result")),
        );
      }).pipe(
        Effect.provideService(Clock.Clock, countingClock),
        Effect.withTracer(observed.tracer),
        Effect.withTracerEnabled(true),
      );
      expect(result).toBe("product result");
      expect(reads).toBe(0);
      expect(observed.spans).toEqual([]);
    }),
  );

  for (const detail of [false, true]) {
    it.effect(`preserves failure and interruption accounting with detail ${String(detail)}`, () =>
      Effect.gen(function* () {
        const observed = observation(detail);
        const exits = yield* Effect.gen(function* () {
          const failed = yield* withWork(
            "axm.hash.content",
            annotateWork({ "axm.work.bytes": 3 }).pipe(
              Effect.andThen(Effect.fail("product failure")),
            ),
            { attributes: { "axm.work.count": 1 } },
          ).pipe(Effect.exit);
          const interrupted = yield* withWork(
            "axm.io.read-file",
            annotateWork({ "axm.io.bytes": 0 }).pipe(Effect.andThen(Effect.interrupt)),
            { attributes: { "axm.work.executed": 1 } },
          ).pipe(Effect.exit);
          return { failed, interrupted };
        }).pipe(
          Effect.provideService(CurrentWorkObserver, observed.observer),
          Effect.withTracer(observed.tracer),
          Effect.withTracerEnabled(true),
        );
        expect(exits.failed).toEqual(Exit.fail("product failure"));
        expect(Exit.hasInterrupts(exits.interrupted)).toBe(true);
        expect(
          observed.records.map(({ fact }) => ({ ...fact, durationMillis: undefined })),
        ).toEqual([
          {
            kind: "axm.hash.content",
            attributes: {
              "axm.work.count": 1,
              "axm.work.bytes": 3,
              "axm.outcome": "failure",
              "axm.failure.kind": "failure",
            },
            outcome: "failure",
            durationMillis: undefined,
          },
          {
            kind: "axm.io.read-file",
            attributes: {
              "axm.work.executed": 1,
              "axm.io.bytes": 0,
              "axm.outcome": "interrupted",
              "axm.failure.kind": "interrupted",
            },
            outcome: "interrupted",
            durationMillis: undefined,
          },
        ]);
        expect(observed.records.every(({ fact }) => typeof fact.durationMillis === "number")).toBe(
          true,
        );
        expect(observed.spans).toHaveLength(detail ? 2 : 0);
        expect(observed.spans.every((span) => span.status._tag === "Ended")).toBe(true);
      }),
    );
  }

  it.effect("keeps concurrent and nested occurrence annotations with their actual parent", () =>
    Effect.gen(function* () {
      const observed = observation();
      const first = Tracer.externalSpan({ traceId: "trace", spanId: "first", sampled: true });
      const second = Tracer.externalSpan({ traceId: "trace", spanId: "second", sampled: true });
      const read = (parent: Tracer.AnySpan, bytes: number) =>
        withWork(
          "axm.io.read-file",
          Effect.gen(function* () {
            yield* annotateWork({ "axm.io.bytes": bytes });
            yield* Effect.yieldNow;
            yield* withWork("axm.parse.settings", annotateWork({ "axm.work.count": 1 }), {
              timed: false,
            });
            yield* annotateWork({ "axm.work.executed": 1 });
          }),
          { timed: false },
        ).pipe(Effect.provideService(Tracer.ParentSpan, parent));
      yield* Effect.all([read(first, 3), read(second, 8)], { concurrency: "unbounded" }).pipe(
        Effect.provideService(CurrentWorkObserver, observed.observer),
        Effect.withTracer(observed.tracer),
        Effect.withTracerEnabled(true),
      );
      for (const [parent, bytes] of [
        [first, 3],
        [second, 8],
      ] as const) {
        const records = observed.records.filter((record) => record.parent === parent);
        expect(records.map(({ fact }) => fact)).toEqual([
          {
            kind: "axm.parse.settings",
            attributes: { "axm.work.count": 1, "axm.outcome": "success" },
            outcome: "success",
          },
          {
            kind: "axm.io.read-file",
            attributes: { "axm.io.bytes": bytes, "axm.work.executed": 1, "axm.outcome": "success" },
            outcome: "success",
          },
        ]);
      }
      expect(observed.spans).toEqual([]);
    }),
  );

  it.effect("captures native causal context and completes overlapping calls exactly once", () =>
    Effect.gen(function* () {
      const observed = observation();
      let active = 0;
      const observer: WorkObserver = {
        ...observed.observer,
        started: () => {
          active += 1;
          return () => {
            active -= 1;
          };
        },
      };
      const parent = Tracer.externalSpan({
        traceId: "trace",
        spanId: "native-owner",
        sampled: true,
      });
      const captured = yield* captureWork.pipe(
        Effect.provideService(CurrentWorkObserver, observer),
        Effect.provideService(Tracer.ParentSpan, parent),
        Effect.withTracer(observed.tracer),
        Effect.withTracerEnabled(true),
      );
      if (captured === undefined) return yield* Effect.die("expected an invocation observer");
      const first = captured.begin("axm.native.lock-io", { timed: false });
      const second = captured.begin("axm.native.lock-io", { timed: false });
      expect(active).toBe(2);
      first.annotate({ "axm.native.operation": "stat", "axm.work.executed": 1 });
      second.finish("success", { "axm.native.operation": "write-file", "axm.work.bytes": 0 });
      expect(active).toBe(1);
      first.finish("failure", { "axm.failure.kind": "not-found" });
      first.annotate({ "axm.work.bytes": 99 });
      first.finish("success", { "axm.work.bytes": 99 });
      expect(active).toBe(0);
      expect(observed.records).toEqual([
        {
          parent,
          fact: {
            kind: "axm.native.lock-io",
            attributes: {
              "axm.native.operation": "write-file",
              "axm.work.bytes": 0,
              "axm.outcome": "success",
            },
            outcome: "success",
          },
        },
        {
          parent,
          fact: {
            kind: "axm.native.lock-io",
            attributes: {
              "axm.native.operation": "stat",
              "axm.work.executed": 1,
              "axm.failure.kind": "not-found",
              "axm.outcome": "failure",
            },
            outcome: "failure",
          },
        },
      ]);
      expect(observed.spans).toEqual([]);
      // Root completion can inspect this balance without relying on detail spans.
      captured.begin("axm.native.lock-io", { timed: false });
      expect(active).toBe(1);
      expect(observed.records).toHaveLength(2);
    }),
  );

  it.effect("records completed measurements without inventing duration or selecting detail", () =>
    Effect.gen(function* () {
      const records: Array<WorkFact> = [];
      const observer: WorkObserver = {
        record: (fact) => records.push(fact),
        detailSelected: () => {
          throw new Error("a completed measurement cannot start detail");
        },
      };
      const fact: WorkFact = {
        kind: "axm.hash.content",
        attributes: { "axm.work.count": 2 },
        outcome: "success",
      };
      yield* recordWork(fact).pipe(Effect.provideService(CurrentWorkObserver, observer));
      expect(records).toEqual([fact]);
      expect(records[0]?.durationMillis).toBeUndefined();
      expect(records[0]?.attributes["axm.work.bytes"]).toBeUndefined();
    }),
  );

  it.effect(
    "uses monotonic elapsed time and preserves producer knowledge of expected absence",
    () =>
      Effect.gen(function* () {
        const observed = observation();
        const clock = yield* Clock.Clock;
        let elapsed = 1_000_000n;
        const measuredClock: Clock.Clock = {
          ...clock,
          monotonicTimeNanosUnsafe: () => elapsed,
          currentTimeNanosUnsafe: () => {
            throw new Error("summary does not need wall-clock span timestamps");
          },
        };
        const result = yield* withWork(
          "axm.io.access",
          Effect.gen(function* () {
            yield* annotateWork({ "axm.failure.kind": "expected-absence" });
            elapsed = 4_000_000n;
            return yield* Effect.fail("missing");
          }),
        ).pipe(
          Effect.provideService(CurrentWorkObserver, observed.observer),
          Effect.provideService(Clock.Clock, measuredClock),
          Effect.exit,
        );
        expect(result).toEqual(Exit.fail("missing"));
        expect(observed.records[0]?.fact).toEqual({
          kind: "axm.io.access",
          attributes: { "axm.failure.kind": "expected-absence", "axm.outcome": "failure" },
          outcome: "failure",
          durationMillis: 3,
        });
      }),
  );

  it.effect("keeps diagnostic callback failures from replacing product outcomes", () =>
    Effect.gen(function* () {
      const observer: WorkObserver = {
        record: () => {
          throw new Error("diagnostic record failure");
        },
        detailSelected: () => {
          throw new Error("diagnostic selection failure");
        },
      };
      const results = yield* Effect.gen(function* () {
        yield* recordWork({ kind: "axm.hash.content", attributes: {}, outcome: "success" });
        return {
          success: yield* withWork("axm.hash.content", Effect.succeed("product result")),
          failure: yield* withWork("axm.hash.content", Effect.fail("product failure")).pipe(
            Effect.exit,
          ),
          interrupted: yield* withWork("axm.hash.content", Effect.interrupt).pipe(Effect.exit),
        };
      }).pipe(Effect.provideService(CurrentWorkObserver, observer), Effect.withTracerEnabled(true));
      expect(results.success).toBe("product result");
      expect(results.failure).toEqual(Exit.fail("product failure"));
      expect(Exit.hasInterrupts(results.interrupted)).toBe(true);
    }),
  );
});
