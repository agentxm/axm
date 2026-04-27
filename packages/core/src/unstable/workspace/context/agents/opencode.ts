/**
 * opencode agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/opencode/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface OpencodeNativeConfig {
  readonly agentId: "opencode";
}

export const agentModule = defineAgentModule<"opencode", OpencodeNativeConfig>({
  agentId: "opencode",
  descriptor,
});
