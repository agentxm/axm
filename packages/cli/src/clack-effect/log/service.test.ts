import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ClackLog } from "./service.js";
import { makeClackLogTestLayer } from "./test.js";

describe("ClackLog", () => {
  it.effect("records message calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.message("hello");
      expect(mock.calls).toEqual([{ method: "message", args: ["hello"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records info calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.info("info msg");
      expect(mock.calls).toEqual([{ method: "info", args: ["info msg"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records success calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.success("done");
      expect(mock.calls).toEqual([{ method: "success", args: ["done"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records step calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.step("step 1");
      expect(mock.calls).toEqual([{ method: "step", args: ["step 1"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records warn calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.warn("caution");
      expect(mock.calls).toEqual([{ method: "warn", args: ["caution"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records error calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.error("failure");
      expect(mock.calls).toEqual([{ method: "error", args: ["failure"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records intro calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.intro("Welcome");
      expect(mock.calls).toEqual([{ method: "intro", args: ["Welcome"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records outro calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.outro("Goodbye");
      expect(mock.calls).toEqual([{ method: "outro", args: ["Goodbye"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records cancel calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.cancel("Cancelled");
      expect(mock.calls).toEqual([{ method: "cancel", args: ["Cancelled"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records note calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.note("body", "title");
      expect(mock.calls).toEqual([{ method: "note", args: ["body", "title"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records box calls", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.box("content", "heading", { rounded: true });
      expect(mock.calls).toEqual([
        { method: "box", args: ["content", "heading", { rounded: true }] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records multiple calls in order", () => {
    const [layer, mock] = makeClackLogTestLayer();
    return Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.intro("start");
      yield* log.info("first");
      yield* log.success("second");
      yield* log.outro("end");
      expect(mock.calls).toEqual([
        { method: "intro", args: ["start"] },
        { method: "info", args: ["first"] },
        { method: "success", args: ["second"] },
        { method: "outro", args: ["end"] },
      ]);
    }).pipe(Effect.provide(layer));
  });
});
