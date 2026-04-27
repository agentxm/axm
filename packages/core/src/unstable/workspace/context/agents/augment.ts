/**
 * augment agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace-context change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceContext`.
 */

import { descriptor } from "../../../agents/augment/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface AugmentNativeConfig {
  readonly agentId: "augment";
}

export const agentModule = defineAgentModule<"augment", AugmentNativeConfig>({
  agentId: "augment",
  descriptor,
});
