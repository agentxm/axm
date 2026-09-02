import * as Layer from "effect/Layer";

import { FrameLive, OutputStreamsLive, ScreenLive } from "../screen/index.js";
import { CliRendererFromScreen } from "./cli-renderer-screen.js";
import { resolveCliOutputPolicy, type CliOutputPolicy } from "./output-policy.js";

/** Transitional adapter. Command call sites migrate to Screen before this layer is removed. */
export const InteractiveRenderer = (options?: { readonly outputPolicy?: CliOutputPolicy }) => {
  const outputPolicy = options?.outputPolicy ?? resolveCliOutputPolicy();
  const frameLayer = Layer.provideMerge(
    FrameLive({ animate: outputPolicy.animate, quiet: outputPolicy.quiet }),
    OutputStreamsLive,
  );
  const screenLayer = Layer.provideMerge(
    ScreenLive({ colors: outputPolicy.colors, animate: outputPolicy.animate }),
    frameLayer,
  );
  return Layer.provideMerge(CliRendererFromScreen({ outputPolicy, mode: "text" }), screenLayer);
};
