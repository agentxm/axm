import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface RovodevNativeConfig {
  readonly agentId: "rovodev";
}

export const agentModule = defineAgentModule<"rovodev", RovodevNativeConfig>({
  agentId: "rovodev",
  descriptor: AGENTS["rovodev"],
});
