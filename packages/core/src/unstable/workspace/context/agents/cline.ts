/**
 * cline agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/cline/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface ClineNativeConfig {
  readonly agentId: "cline";
}

export const agentModule = defineAgentModule<"cline", ClineNativeConfig>({
  agentId: "cline",
  descriptor,
});
