import * as Layer from "effect/Layer";

import { FrameLive, OutputStreamsLive, ScreenLive } from "./index.js";
import { resolveCliOutputPolicy, type CliOutputPolicy } from "./output-policy.js";

/** Live Screen layer for human terminal output. */
export const InteractiveScreen = (options?: { readonly outputPolicy?: CliOutputPolicy }) => {
  const outputPolicy = options?.outputPolicy ?? resolveCliOutputPolicy();
  const frameLayer = Layer.provideMerge(
    FrameLive({ animate: outputPolicy.animate, quiet: outputPolicy.quiet }),
    OutputStreamsLive,
  );
  const screenLayer = Layer.provideMerge(
    ScreenLive({
      colors: outputPolicy.colors,
      animate: outputPolicy.animate,
      quiet: outputPolicy.quiet,
    }),
    frameLayer,
  );
  return screenLayer;
};
