import type { Doc } from "../../screen/doc.js";
import { setupPlanDoc, setupResultDoc } from "../../root/setup/view.js";
import { previewOutcome, setupOpening, syncedPlan } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/**
 * `axm setup --preview`: the same title and plan ledger an interactive setup
 * gates on, with the defaults it took in the verdict's aside and the explicit
 * command that applies exactly this candidate.
 */
const setupPreview: Doc = [
  ...setupOpening(true),
  ...setupPlanDoc(syncedPlan),
  ...setupResultDoc(previewOutcome, {
    verbosity: "normal",
    suggestions: [
      {
        description: "Apply setup",
        cmd: "axm setup --yes --scope project --agent claude-code --agent codex --agent cursor",
      },
    ],
    displayDirectory: (directory) => directory,
  }),
];

export default galleryModule({
  _tag: "document",
  name: "setup-preview",
  doc: setupPreview,
});
