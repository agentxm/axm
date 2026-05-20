import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface FirebenderNativeConfig {
  readonly agentId: "firebender";
}

export const agentModule = defineAgentModule<"firebender", FirebenderNativeConfig>({
  agentId: "firebender",
  descriptor: AGENTS["firebender"],
});
