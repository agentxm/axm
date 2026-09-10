import * as Layer from "effect/Layer";

import { FrameLive, OutputStreamsLive, ScreenLive, asciiGlyphs, unicodeGlyphs } from "./index.js";
import { resolveCliOutputPolicy, type CliOutputPolicy } from "./output-policy.js";

/** Live Screen layer for human terminal output. */
export const InteractiveScreen = (options?: { readonly outputPolicy?: CliOutputPolicy }) => {
  const outputPolicy = options?.outputPolicy ?? resolveCliOutputPolicy();
  const glyphs = outputPolicy.glyphs === "ascii" ? asciiGlyphs : unicodeGlyphs;
  const frameLayer = Layer.provideMerge(
    FrameLive({
      animate: outputPolicy.animate,
      quiet: outputPolicy.quiet,
      colors: outputPolicy.stderrColors,
      glyphs,
    }),
    OutputStreamsLive,
  );
  const screenLayer = Layer.provideMerge(
    ScreenLive({
      colors: { stdout: outputPolicy.stdoutColors, stderr: outputPolicy.stderrColors },
      animate: outputPolicy.animate,
      glyphs,
    }),
    frameLayer,
  );
  return screenLayer;
};
