import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface CortexNativeConfig {
  readonly agentId: "cortex";
}

export const agentModule = defineAgentModule<"cortex", CortexNativeConfig>({
  agentId: "cortex",
  descriptor: AGENTS["cortex"],
});
