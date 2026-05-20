import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface DeepagentsNativeConfig {
  readonly agentId: "deepagents";
}

export const agentModule = defineAgentModule<"deepagents", DeepagentsNativeConfig>({
  agentId: "deepagents",
  descriptor: AGENTS["deepagents"],
});
