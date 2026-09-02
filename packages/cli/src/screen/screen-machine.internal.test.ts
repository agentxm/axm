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
});
