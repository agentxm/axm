import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  FrameLive,
  OutputStreamsLive,
  Screen,
  ScreenLive,
  ScreenLoggerLive,
} from "../../../cli/dist/src/screen/index.js";
import {
  makeOperationLifecycle,
  observeUnit,
  OperationLifecycle,
} from "../../../../packages/core/workspace/dist/src/transitions/planning/index.js";

// `plain` stands for the terminal that cannot animate, where the transitions
// the live ledger would have shown become transcript lines instead.
const animate = process.argv[2] !== "plain";

const frameLayer = Layer.provideMerge(
  FrameLive({ animate, quiet: false, colors: false }),
  OutputStreamsLive,
);
const screenLayer = Layer.provideMerge(
  ScreenLive({ colors: { stdout: false, stderr: false }, animate }),
  frameLayer,
);
const loggerLayer = Layer.provide(ScreenLoggerLive("normal"), screenLayer);

const program = Effect.gen(function* () {
  const screen = yield* Screen;
  const lifecycle = yield* makeOperationLifecycle({ name: "Frame task", mode: "apply" });
  yield* screen.observe(lifecycle);
  yield* lifecycle.publish((seq, atMs) => ({
    _tag: "OperationStarted",
    seq,
    atMs,
    operationId: lifecycle.operationId,
    name: "Frame task",
    mode: "apply",
  }));
  yield* observeUnit(
    { id: "frame-unit", label: "Running frame task" },
    Effect.logWarning("warning stayed whole").pipe(Effect.andThen(Effect.sleep("120 millis"))),
  ).pipe(Effect.provideService(OperationLifecycle, lifecycle));
  yield* lifecycle.settle("completed");
  yield* lifecycle.drained.await;
}).pipe(Effect.provide(Layer.merge(screenLayer, loggerLayer)), Effect.scoped);

await Effect.runPromise(program);
