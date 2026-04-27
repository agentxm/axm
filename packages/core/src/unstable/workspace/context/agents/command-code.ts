/**
 * command-code agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/command-code/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface CommandCodeNativeConfig {
  readonly agentId: "command-code";
}

export const agentModule = defineAgentModule<"command-code", CommandCodeNativeConfig>({
  agentId: "command-code",
  descriptor,
});
