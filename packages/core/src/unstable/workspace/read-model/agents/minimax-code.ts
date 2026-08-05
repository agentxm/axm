import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface MinimaxCodeNativeConfig {
  readonly agentId: "minimax-code";
}
export const agentModule = defineAgentModule<"minimax-code", MinimaxCodeNativeConfig>({
  agentId: "minimax-code",
  descriptor: AGENTS["minimax-code"],
});
