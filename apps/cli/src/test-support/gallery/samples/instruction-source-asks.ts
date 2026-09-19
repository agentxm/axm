import {
  customSourceAsk,
  instructionSourceAsk,
} from "../../../workspace-initialization-interaction-live.js";

/** Setup's instructions-source list as the canvas draws it. */
export const instructionSource = instructionSourceAsk("AGENTS.md", [
  { fileName: "AGENTS.md", exists: true, lines: 128 },
  { fileName: "CLAUDE.md", exists: true, lines: 64 },
]);

export const agentsSource = instructionSource.options[0];

/** Setup's question for a source file the list did not offer. */
export const instructionFileName = customSourceAsk;
