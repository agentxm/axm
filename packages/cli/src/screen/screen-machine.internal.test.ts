import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Screen, ScreenMachine } from "./screen.js";
import { makeTestOutputStreams } from "./streams.js";

const makeHarness = (quiet = false) => {
  const streams = makeTestOutputStreams();
  return {
    state: streams.state,
    layer: Layer.provide(ScreenMachine({ quiet }), streams.layer),
  };
};

describe("machine Screen", () => {
  it.effect("emits one schema-backed result envelope", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const emitted = yield* screen.document(
        { value: "ok" },
        Schema.Struct({ value: Schema.String }),
      );
      expect(emitted).toBe(true);
      expect(JSON.parse(harness.state.stdout.join(""))).toMatchObject({
        ok: true,
        result: { value: "ok" },
      });
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("preserves progress labels and quiet suppresses only progress", () => {
    const harness = makeHarness(true);
    return Effect.gen(function* () {
      const screen = yield* Screen;
      yield* screen.task("Resolving publish registry", () => Effect.void);
      yield* screen.log({ level: "warn", message: "warning" });
      expect(harness.state.stderr.join("")).not.toContain("Resolving publish registry");
      expect(harness.state.stderr.join("")).toContain('"type":"log"');
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("rejects a second final result before writing it", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const screen = yield* Screen;
      yield* screen.document("first", Schema.String);
      const second = yield* Effect.exit(screen.document("second", Schema.String));

      expect(second._tag).toBe("Failure");
      expect(harness.state.stdout).toHaveLength(1);
      expect(JSON.parse(harness.state.stdout[0] ?? "")).toMatchObject({ result: "first" });
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("handles a sustained semantic event stream without losing order", () => {
    const harness = makeHarness();
    const eventCount = 10_000;
    return Effect.gen(function* () {
      const screen = yield* Screen;
      yield* Effect.forEach(
        Array.from({ length: eventCount }, (_, index) => index),
        (index) => screen.log({ level: "info", message: `event-${String(index)}` }),
        { discard: true },
      );

      expect(harness.state.stderr).toHaveLength(eventCount);
      expect(harness.state.stderr[0]).toContain("event-0");
      expect(harness.state.stderr[eventCount - 1]).toContain(`event-${String(eventCount - 1)}`);
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("preserves Windows paths in machine documents", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const screen = yield* Screen;
      yield* screen.document(
        { path: String.raw`C:\Users\agent\workspace\axm.json` },
        Schema.Struct({ path: Schema.String }),
      );

      expect(JSON.parse(harness.state.stdout.join(""))).toMatchObject({
        result: { path: String.raw`C:\Users\agent\workspace\axm.json` },
      });
    }).pipe(Effect.provide(harness.layer));
  });
});
