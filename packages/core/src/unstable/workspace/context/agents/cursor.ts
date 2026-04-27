/**
 * cursor agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/cursor/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface CursorNativeConfig {
  readonly agentId: "cursor";
}

export const agentModule = defineAgentModule<"cursor", CursorNativeConfig>({
  agentId: "cursor",
  descriptor,
});
