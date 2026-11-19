import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import type { Scene } from "../../screen/scene.js";
import { toolkitPick } from "./samples/pick-asks.js";
import { galleryModule } from "./fixture.js";

/** A question owns the active region; its completed operation context is durable. */
const widthPromptsPickForeground: Scene = {
  interaction: (facts) => pickDoc(toolkitPick, initialPickState(toolkitPick), facts.rows),
};

export default galleryModule({
  _tag: "composed",
  name: "width-prompts--pick-foreground",
  scene: widthPromptsPickForeground,
  snapshotWidths: [80],
});
