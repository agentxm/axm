import type { Doc } from "../../screen/doc.js";
import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import { agentsPick } from "./samples/pick-asks.js";
import { setupOpening } from "./samples/setup-records.js";

/**
 * Setup opens like every other command — its title line, then what the scan
 * found — and asks which agents to configure beneath them (canvas *Direction:
 * Ledger*, board `Ledger-setup-play`, frame *pick agents*). No logo and no
 * phase strip come first.
 */
export const ledgerSetupPlayAgents: Doc = [
  ...setupOpening(),
  ...pickDoc(agentsPick, initialPickState(agentsPick), 12),
];
