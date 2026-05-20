import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface AiderDeskNativeConfig {
  readonly agentId: "aider-desk";
}

export const agentModule = defineAgentModule<"aider-desk", AiderDeskNativeConfig>({
  agentId: "aider-desk",
  descriptor: AGENTS["aider-desk"],
});
