/**
 * mcpjam agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/mcpjam/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface McpjamNativeConfig {
  readonly agentId: "mcpjam";
}

export const agentModule = defineAgentModule<"mcpjam", McpjamNativeConfig>({
  agentId: "mcpjam",
  descriptor,
});
