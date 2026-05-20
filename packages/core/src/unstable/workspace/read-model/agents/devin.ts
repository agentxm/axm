import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface DevinNativeConfig {
  readonly agentId: "devin";
}

export const agentModule = defineAgentModule<"devin", DevinNativeConfig>({
  agentId: "devin",
  descriptor: AGENTS["devin"],
});
