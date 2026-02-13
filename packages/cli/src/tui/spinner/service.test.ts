import * as Data from "effect/Data";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Spinner } from "./service.js";
import { makeSpinnerTestLayer } from "./test.js";

describe("Spinner test layer", () => {
  const [TestLayer, mock] = makeSpinnerTestLayer();

  it.effect("records start calls", () =>
    Effect.gen(function* () {
      const spinner = yield* Spinner;
      yield* spinner.start("Loading...");

      expect(mock.starts).toEqual(["Loading..."]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("records stop calls on the handle", () =>
    Effect.gen(function* () {
      const spinner = yield* Spinner;
      const handle = yield* spinner.start("Working...");
      yield* handle.stop("Done!");

      expect(mock.stops).toEqual(["Done!"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("records multiple start/stop sequences", () =>
    Effect.gen(function* () {
      const spinner = yield* Spinner;

      const h1 = yield* spinner.start("Step 1");
      yield* h1.stop("Step 1 done");

      const h2 = yield* spinner.start("Step 2");
      yield* h2.stop("Step 2 done");

      expect(mock.starts).toContain("Step 1");
      expect(mock.starts).toContain("Step 2");
      expect(mock.stops).toContain("Step 1 done");
      expect(mock.stops).toContain("Step 2 done");
    }).pipe(Effect.provide(TestLayer)),
  );
});

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("Spinner stopAll on error", () => {
  it.effect("stopAll is called when a program fails with an active spinner", () => {
    const [TestLayer, mock] = makeSpinnerTestLayer();

    const program = Effect.gen(function* () {
      const spinner = yield* Spinner;
      yield* spinner.start("Working...");
      // Fail while spinner is active
      return yield* new TestError({ message: "boom" });
    }).pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          const spinner = yield* Spinner;
          yield* spinner.stopAll;
        }),
      ),
    );

    return program.pipe(
      Effect.catchAll(() => Effect.void),
      Effect.map(() => {
        expect(mock.stopAllCalls).toHaveLength(1);
        // 1 spinner was active when stopAll was called
        expect(mock.stopAllCalls[0]).toBe(1);
      }),
      Effect.provide(TestLayer),
    );
  });

  it.effect("stopAll is not called when program succeeds", () => {
    const [TestLayer, mock] = makeSpinnerTestLayer();

    const program = Effect.gen(function* () {
      const spinner = yield* Spinner;
      const handle = yield* spinner.start("Working...");
      yield* handle.stop("Done");
    }).pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          const spinner = yield* Spinner;
          yield* spinner.stopAll;
        }),
      ),
    );

    return program.pipe(
      Effect.map(() => {
        expect(mock.stopAllCalls).toHaveLength(0);
      }),
      Effect.provide(TestLayer),
    );
  });

  it.effect("stopAll is called before error handler runs", () => {
    const [TestLayer] = makeSpinnerTestLayer();
    const order: string[] = [];

    const program = Effect.gen(function* () {
      const spinner = yield* Spinner;
      yield* spinner.start("Working...");
      return yield* new TestError({ message: "boom" });
    }).pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          const spinner = yield* Spinner;
          yield* spinner.stopAll;
          order.push("stopAll");
        }),
      ),
      Effect.catchAll(() =>
        Effect.sync(() => {
          order.push("errorHandler");
        }),
      ),
    );

    return program.pipe(
      Effect.map(() => {
        expect(order).toEqual(["stopAll", "errorHandler"]);
      }),
      Effect.provide(TestLayer),
    );
  });
});
