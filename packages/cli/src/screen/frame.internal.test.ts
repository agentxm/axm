import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { Frame, FrameLive } from "./frame.js";
import { makeTestOutputStreams } from "./streams.js";

const makeHarness = (animate: boolean) => {
  const streams = makeTestOutputStreams({ stdoutIsTTY: animate, stderrIsTTY: animate });
  return {
    state: streams.state,
    layer: Layer.provide(FrameLive({ animate, quiet: false }), streams.layer),
  };
};

describe("Frame", () => {
  it.effect("inserts transcript output above a live frame and repaints it", () => {
    const harness = makeHarness(true);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      const task = yield* frame.task("Installing skills");
      yield* frame.stderr("warning\n");
      yield* task.end("success", "Installed skills");
      const output = harness.state.stderr.join("");
      expect(output).toContain("Installing skills");
      expect(output).toContain("warning\n");
      expect(output).toContain("✔ Installed skills\n");
      expect(output.indexOf("warning\n")).toBeLessThan(output.lastIndexOf("Installing skills"));
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect("renders plain tasks as static transcript lines", () => {
    const harness = makeHarness(false);
    return Effect.gen(function* () {
      const frame = yield* Frame;
      const task = yield* frame.task("Installing skills");
      yield* task.progress(1, 2);
      yield* task.end("cancelled", "Install cancelled");
      expect(harness.state.stderr.join("")).toBe("◆ Installing skills\n■ Install cancelled\n");
    }).pipe(Effect.provide(harness.layer), Effect.scoped);
  });

  it.effect(
    "restores the cursor and preserves transcript output when interrupted during resize",
    () => {
      const streams = makeTestOutputStreams({
        stdoutIsTTY: true,
        stderrIsTTY: true,
        resize: Stream.callback((queue) =>
          Effect.acquireRelease(
            Effect.sync(() => void Queue.offerUnsafe(queue, 64)),
            () => Effect.void,
          ),
        ),
      });
      return Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const fiber = yield* Effect.gen(function* () {
          const frame = yield* Frame;
          yield* frame.task("Installing skills");
          yield* frame.stderr("warning stayed whole\n");
          yield* Deferred.succeed(started, undefined);
          return yield* Effect.never;
        }).pipe(
          Effect.provide(Layer.provide(FrameLive({ animate: true, quiet: false }), streams.layer)),
          Effect.scoped,
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);

        const output = streams.state.stderr.join("");
        expect(output).toContain("warning stayed whole\n");
        expect(output).toContain("Installing skills");
        expect(output).toContain("\u001b[?25h");
      });
    },
  );
});
