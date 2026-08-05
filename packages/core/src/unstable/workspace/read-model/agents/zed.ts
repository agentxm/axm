import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface ZedNativeConfig {
  readonly agentId: "zed";
}
export const agentModule = defineAgentModule<"zed", ZedNativeConfig>({
  agentId: "zed",
  descriptor: AGENTS.zed,
});
