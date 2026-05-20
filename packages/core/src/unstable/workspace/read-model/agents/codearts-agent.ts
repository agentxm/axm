import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface CodeartsAgentNativeConfig {
  readonly agentId: "codearts-agent";
}

export const agentModule = defineAgentModule<"codearts-agent", CodeartsAgentNativeConfig>({
  agentId: "codearts-agent",
  descriptor: AGENTS["codearts-agent"],
});
