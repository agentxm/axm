import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface OnaNativeConfig {
  readonly agentId: "ona";
}
export const agentModule = defineAgentModule<"ona", OnaNativeConfig>({
  agentId: "ona",
  descriptor: AGENTS.ona,
});
