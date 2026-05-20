import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface WarpNativeConfig {
  readonly agentId: "warp";
}

export const agentModule = defineAgentModule<"warp", WarpNativeConfig>({
  agentId: "warp",
  descriptor: AGENTS["warp"],
});
