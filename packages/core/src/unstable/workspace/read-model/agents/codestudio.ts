import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface CodestudioNativeConfig {
  readonly agentId: "codestudio";
}

export const agentModule = defineAgentModule<"codestudio", CodestudioNativeConfig>({
  agentId: "codestudio",
  descriptor: AGENTS["codestudio"],
});
