import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import { liveLedgerDoc, type LivePlan } from "../../screen/live-ledger.js";
import { initialProgress, reduceProgress } from "../../screen/progress.js";
import type { Scene } from "../../screen/scene.js";
import { toolkitPick } from "./pick-asks.js";

/** The install as it stands before anything is chosen: started, nothing running. */
const started = reduceProgress(initialProgress, {
  _tag: "OperationStarted",
  seq: 1,
  atMs: 0,
  operationId: "install-1",
  name: "Installing",
  mode: "apply",
});

const plan: LivePlan = {
  title: "Installing",
  aside: "from @acme/toolkit 3.2.0",
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: toolkitPick.options.map((option) => ({
    id: `extension:${option.title}`,
    mark: "waiting",
    cells: [option.title, "3.2.0"],
  })),
};

/**
 * An install's ledger with the pick beneath it (canvas *Width and height*,
 * board `Width-prompts`, frame *a 16-row terminal with a ledger and a pick
 * together*): the question keeps its minimum and the ledger shrinks toward
 * its header and fold line.
 */
export const widthPromptsPickWithLedger: Scene = {
  ledger: (facts) => liveLedgerDoc(started, { plan, rows: facts.rows, nowMs: 0 }),
  interaction: (facts) => pickDoc(toolkitPick, initialPickState(toolkitPick), facts.rows),
};
