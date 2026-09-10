import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import {
  makeOperationLifecycle,
  observeUnit,
  OperationLifecycle,
} from "@agentxm/workspace-operations";

import { ProgressEventSchema } from "./machine-events.js";
import { Screen, ScreenMachine } from "./screen.js";
import { makeTestOutputStreams } from "./streams.js";

const makeHarness = (quiet = false) => {
  const streams = makeTestOutputStreams();
  return {
    state: streams.state,
    layer: Layer.provide(ScreenMachine({ quiet }), streams.layer),
  };
};

const decodeProgress = Schema.decodeUnknownSync(ProgressEventSchema);

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

  it.effect("writes every lifecycle event as NDJSON in order before the result document", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const lifecycle = yield* makeOperationLifecycle({ name: "Install skill", mode: "apply" });
      yield* screen.observe(lifecycle);
      yield* lifecycle.publish((seq, atMs) => ({
        _tag: "OperationStarted",
        seq,
        atMs,
        operationId: lifecycle.operationId,
        name: "Install skill",
        mode: "apply",
      }));
      yield* observeUnit({ id: "skill:review", label: "review", total: 1 }, Effect.void).pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      yield* lifecycle.settle("applied");
      yield* lifecycle.drained.await;
      yield* screen.document({ value: "ok" }, Schema.Struct({ value: Schema.String }));

      const events = harness.state.stderr.map((line) => decodeProgress(JSON.parse(line)));
      expect(events.map((entry) => entry.event._tag)).toEqual([
        "OperationStarted",
        "UnitStarted",
        "UnitResolved",
        "OperationSettled",
      ]);
      expect(events.map((entry) => entry.event.seq)).toEqual([1, 2, 3, 4]);
      expect(events.every((entry) => entry.type === "progress")).toBe(true);
      expect(harness.state.stdout).toHaveLength(1);
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("quiet suppresses progress but not logs, and still drains", () => {
    const harness = makeHarness(true);
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const lifecycle = yield* makeOperationLifecycle({ name: "Publish", mode: "apply" });
      yield* screen.observe(lifecycle);
      yield* lifecycle.publish((seq, atMs) => ({
        _tag: "PhaseStarted",
        seq,
        atMs,
        phase: "apply",
      }));
      yield* lifecycle.settle("applied");
      yield* lifecycle.drained.await;
      yield* screen.log({ level: "warn", message: "warning" });
      expect(harness.state.stderr.join("")).not.toContain('"type":"progress"');
      expect(harness.state.stderr.join("")).toContain('"type":"log"');
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
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
