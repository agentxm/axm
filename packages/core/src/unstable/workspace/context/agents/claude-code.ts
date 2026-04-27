/**
 * claude-code agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/claude-code/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface ClaudeCodeNativeConfig {
  readonly agentId: "claude-code";
}

export const agentModule = defineAgentModule<"claude-code", ClaudeCodeNativeConfig>({
  agentId: "claude-code",
  descriptor,
});
