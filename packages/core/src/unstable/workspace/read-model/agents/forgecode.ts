import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface ForgecodeNativeConfig {
  readonly agentId: "forgecode";
}

export const agentModule = defineAgentModule<"forgecode", ForgecodeNativeConfig>({
  agentId: "forgecode",
  descriptor: AGENTS["forgecode"],
});
