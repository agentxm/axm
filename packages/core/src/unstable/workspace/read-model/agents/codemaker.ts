import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface CodemakerNativeConfig {
  readonly agentId: "codemaker";
}

export const agentModule = defineAgentModule<"codemaker", CodemakerNativeConfig>({
  agentId: "codemaker",
  descriptor: AGENTS["codemaker"],
});
