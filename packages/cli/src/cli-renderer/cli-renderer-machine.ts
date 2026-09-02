import * as Layer from "effect/Layer";

import { OutputStreamsLive, ScreenMachine } from "../screen/index.js";
import { CliRendererFromScreen } from "./cli-renderer-screen.js";

/** Transitional adapter preserving the machine document and event contracts. */
export const MachineRenderer = (options?: { readonly quiet?: boolean }) => {
  const quiet = options?.quiet === true;
  const outputPolicy = {
    colors: false,
    animate: false,
    interactiveActivity: false,
    quiet,
  } as const;
  const screenLayer = Layer.provideMerge(ScreenMachine({ quiet }), OutputStreamsLive);
  return Layer.provideMerge(CliRendererFromScreen({ outputPolicy, mode: "machine" }), screenLayer);
};
