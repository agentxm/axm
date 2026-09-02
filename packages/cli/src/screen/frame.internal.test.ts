import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
});
