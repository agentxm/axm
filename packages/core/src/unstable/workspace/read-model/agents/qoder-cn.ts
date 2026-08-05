import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface QoderCnNativeConfig {
  readonly agentId: "qoder-cn";
}
export const agentModule = defineAgentModule<"qoder-cn", QoderCnNativeConfig>({
  agentId: "qoder-cn",
  descriptor: AGENTS["qoder-cn"],
});
