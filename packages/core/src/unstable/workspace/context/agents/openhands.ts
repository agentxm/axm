/**
 * openhands agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/openhands/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface OpenhandsNativeConfig {
  readonly agentId: "openhands";
}

export const agentModule = defineAgentModule<"openhands", OpenhandsNativeConfig>({
  agentId: "openhands",
  descriptor,
});
