import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface TabnineCliNativeConfig {
  readonly agentId: "tabnine-cli";
}

export const agentModule = defineAgentModule<"tabnine-cli", TabnineCliNativeConfig>({
  agentId: "tabnine-cli",
  descriptor: AGENTS["tabnine-cli"],
});
