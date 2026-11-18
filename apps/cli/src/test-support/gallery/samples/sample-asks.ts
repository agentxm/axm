import type { Ask } from "../../../screen/ask/ask.js";
import { applyChangesGate, syncInstructions } from "./confirm-asks.js";
import { instructionFileName, instructionSource } from "./instruction-source-asks.js";
import { agentsPick, toolkitPick } from "./pick-asks.js";

/** A sample question by the name the lab drives it by. */
interface SampleAsk {
  readonly name: string;
  readonly ask: Ask<unknown>;
}

/** The gallery's sample questions, one of each kind and the lists the canvas draws. */
export const sampleAsks: ReadonlyArray<SampleAsk> = [
  { name: "agents", ask: agentsPick },
  { name: "apply-changes", ask: applyChangesGate },
  { name: "instruction-file", ask: instructionFileName },
  { name: "instruction-source", ask: instructionSource },
  { name: "sync-instructions", ask: syncInstructions },
  { name: "toolkit", ask: toolkitPick },
];
