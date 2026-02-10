import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { Log } from "./service.js";
import { makeLogTestLayer } from "./test.js";

describe("Log", () => {
  it("records info calls", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.info("hello");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.info).toEqual(["hello"]);
  });

  it("records warn calls", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.warn("caution");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.warn).toEqual(["caution"]);
  });

  it("records error calls", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.error("failure");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.error).toEqual(["failure"]);
  });

  it("records success calls", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.success("done");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.success).toEqual(["done"]);
  });

  it("records message calls", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.message("plain");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.message).toEqual(["plain"]);
  });

  it("records multiple calls across methods", async () => {
    const [layer, mock] = makeLogTestLayer();
    await Effect.gen(function* () {
      const log = yield* Log;
      yield* log.info("a");
      yield* log.info("b");
      yield* log.warn("c");
      yield* log.error("d");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.logs.info).toEqual(["a", "b"]);
    expect(mock.logs.warn).toEqual(["c"]);
    expect(mock.logs.error).toEqual(["d"]);
    expect(mock.logs.success).toEqual([]);
    expect(mock.logs.message).toEqual([]);
  });
});
