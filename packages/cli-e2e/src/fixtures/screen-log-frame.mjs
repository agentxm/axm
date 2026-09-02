import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  FrameLive,
  OutputStreamsLive,
  Screen,
  ScreenLive,
  ScreenLoggerLive,
} from "../../../cli/dist/src/screen/index.js";

const frameLayer = Layer.provideMerge(
  FrameLive({ animate: true, quiet: false }),
  OutputStreamsLive,
);
const screenLayer = Layer.provideMerge(ScreenLive({ colors: false, animate: true }), frameLayer);
const loggerLayer = Layer.provide(ScreenLoggerLive("normal"), screenLayer);

const program = Effect.gen(function* () {
  const screen = yield* Screen;
  yield* screen.task(
    "Running frame task",
    () =>
      Effect.logWarning("warning stayed whole").pipe(Effect.andThen(Effect.sleep("120 millis"))),
    { successMessage: "Finished frame task" },
  );
}).pipe(Effect.provide(Layer.merge(screenLayer, loggerLayer)), Effect.scoped);

await Effect.runPromise(program);
