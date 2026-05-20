import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface DextoNativeConfig {
  readonly agentId: "dexto";
}

export const agentModule = defineAgentModule<"dexto", DextoNativeConfig>({
  agentId: "dexto",
  descriptor: AGENTS["dexto"],
});
