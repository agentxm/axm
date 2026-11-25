import * as Layer from "effect/Layer";

import { ScreenMachine } from "./screen.js";
import { OutputStreamsLive } from "./streams.js";

/** Live Screen layer for machine documents and event streams. */
export const MachineScreen = (options?: { readonly quiet?: boolean }) => {
  const quiet = options?.quiet === true;
  const screenLayer = Layer.provideMerge(ScreenMachine({ quiet }), OutputStreamsLive);
  return screenLayer;
};
