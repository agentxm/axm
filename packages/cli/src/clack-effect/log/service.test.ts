import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ClackLog } from "./service.js";
import { ClackLogTest, ClackLogTestLayer } from "./ClackLogTest.js";

describe("ClackLog", () => {
  it.effect("records message calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.message("hello");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "message", args: ["hello"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records info calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.info("info msg");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "info", args: ["info msg"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records success calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.success("done");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "success", args: ["done"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records step calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.step("step 1");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "step", args: ["step 1"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records warn calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.warn("caution");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "warn", args: ["caution"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records error calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.error("failure");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "error", args: ["failure"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records intro calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.intro("Welcome");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "intro", args: ["Welcome"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records outro calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.outro("Goodbye");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "outro", args: ["Goodbye"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records cancel calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.cancel("Cancelled");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "cancel", args: ["Cancelled"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records note calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.note("body", "title");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([{ method: "note", args: ["body", "title"] }]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records box calls", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.box("content", "heading", { rounded: true });
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([
        { method: "box", args: ["content", "heading", { rounded: true }] },
      ]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("records multiple calls in order", () =>
    Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.intro("start");
      yield* log.info("first");
      yield* log.success("second");
      yield* log.outro("end");
      const record = yield* (yield* ClackLogTest).get;
      expect(record.calls).toEqual([
        { method: "intro", args: ["start"] },
        { method: "info", args: ["first"] },
        { method: "success", args: ["second"] },
        { method: "outro", args: ["end"] },
      ]);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );
});
