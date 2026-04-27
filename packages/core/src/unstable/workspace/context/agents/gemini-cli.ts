/**
 * gemini-cli agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/gemini-cli/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface GeminiCliNativeConfig {
  readonly agentId: "gemini-cli";
}

export const agentModule = defineAgentModule<"gemini-cli", GeminiCliNativeConfig>({
  agentId: "gemini-cli",
  descriptor,
});
