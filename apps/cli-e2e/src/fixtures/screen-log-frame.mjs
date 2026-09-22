import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeTerminal from "@effect/platform-node/NodeTerminal";

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

// Both modes commit the same history; only the active tail animates.
const animate = process.argv[2] !== "plain";

const frameLayer = Layer.provideMerge(
  FrameLive({ animate, quiet: false, colors: false }),
  OutputStreamsLive,
);
const screenLayer = Layer.provideMerge(
  ScreenLive({ colors: { stdout: false, stderr: false }, animate }),
  Layer.merge(frameLayer, NodeTerminal.layer),
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
  yield* lifecycle.publish((seq, atMs) => ({
    _tag: "PhaseStarted",
    seq,
    atMs,
    phase: "resolution",
  }));
  for (let index = 0; index < 16; index += 1) {
    yield* screen.note([{ _tag: "paragraph", text: `Committed context ${index}` }]);
  }
  yield* observeUnit(
    { id: "frame-unit", label: "Running frame task" },
    Effect.logWarning("warning stayed whole").pipe(Effect.andThen(Effect.sleep("250 millis"))),
  ).pipe(Effect.provideService(OperationLifecycle, lifecycle));
  if (process.argv[2] === "question") {
    const answer = yield* Effect.result(
      screen.ask({
        _tag: "Confirm",
        question: "Keep these changes?",
        label: "Changes",
        choices: [
          { key: "y", word: "yes", value: true },
          { key: "n", word: "no", value: false },
        ],
      }),
    );
    if (answer._tag === "Failure")
      yield* screen.note([{ _tag: "paragraph", text: "Question could not continue" }]);
  }
  yield* lifecycle.settle("completed");
  yield* lifecycle.drained.await;
  yield* screen.result([{ _tag: "paragraph", text: "Frame result complete" }]);
}).pipe(Effect.provide(Layer.merge(screenLayer, loggerLayer)), Effect.scoped);

await Effect.runPromise(program);
