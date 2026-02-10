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
