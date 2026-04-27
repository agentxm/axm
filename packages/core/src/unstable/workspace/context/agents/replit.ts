/**
 * replit agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/replit/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface ReplitNativeConfig {
  readonly agentId: "replit";
}

export const agentModule = defineAgentModule<"replit", ReplitNativeConfig>({
  agentId: "replit",
  descriptor,
});
