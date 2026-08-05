import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface LingmaNativeConfig {
  readonly agentId: "lingma";
}
export const agentModule = defineAgentModule<"lingma", LingmaNativeConfig>({
  agentId: "lingma",
  descriptor: AGENTS.lingma,
});
