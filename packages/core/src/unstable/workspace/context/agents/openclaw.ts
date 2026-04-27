/**
 * openclaw agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/openclaw/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface OpenclawNativeConfig {
  readonly agentId: "openclaw";
}

export const agentModule = defineAgentModule<"openclaw", OpenclawNativeConfig>({
  agentId: "openclaw",
  descriptor,
});
