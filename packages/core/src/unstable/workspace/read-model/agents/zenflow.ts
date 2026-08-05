import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface ZenflowNativeConfig {
  readonly agentId: "zenflow";
}
export const agentModule = defineAgentModule<"zenflow", ZenflowNativeConfig>({
  agentId: "zenflow",
  descriptor: AGENTS.zenflow,
});
