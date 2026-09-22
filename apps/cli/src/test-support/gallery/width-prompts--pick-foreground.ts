import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import type { Scene } from "../../screen/scene.js";
import { toolkitPick } from "./samples/pick-asks.js";

/** A question owns the active region; its completed operation context is durable. */
export const widthPromptsPickForeground: Scene = {
  interaction: (facts) => pickDoc(toolkitPick, initialPickState(toolkitPick), facts.rows),
};
