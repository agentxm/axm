import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface IflowCliNativeConfig {
  readonly agentId: "iflow-cli";
}
export const agentModule = defineAgentModule<"iflow-cli", IflowCliNativeConfig>({
  agentId: "iflow-cli",
  descriptor: AGENTS["iflow-cli"],
});
