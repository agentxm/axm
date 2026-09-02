import * as Layer from "effect/Layer";

import { OutputStreamsLive, ScreenMachine } from "./index.js";

/** Live Screen layer for machine documents and event streams. */
export const MachineScreen = (options?: { readonly quiet?: boolean }) => {
  const quiet = options?.quiet === true;
  const screenLayer = Layer.provideMerge(ScreenMachine({ quiet }), OutputStreamsLive);
  return screenLayer;
};
