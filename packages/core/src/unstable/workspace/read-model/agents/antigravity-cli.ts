import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";
export interface AntigravityCliNativeConfig {
  readonly agentId: "antigravity-cli";
}
export const agentModule = defineAgentModule<"antigravity-cli", AntigravityCliNativeConfig>({
  agentId: "antigravity-cli",
  descriptor: AGENTS["antigravity-cli"],
});
