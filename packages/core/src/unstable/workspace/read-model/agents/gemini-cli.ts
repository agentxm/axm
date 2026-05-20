/**
 * gemini-cli agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface GeminiCliNativeConfig {
  readonly agentId: "gemini-cli";
}

export const agentModule = defineAgentModule<"gemini-cli", GeminiCliNativeConfig>({
  agentId: "gemini-cli",
  descriptor: AGENTS["gemini-cli"],
});
