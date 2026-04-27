/**
 * qoder agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/qoder/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface QoderNativeConfig {
  readonly agentId: "qoder";
}

export const agentModule = defineAgentModule<"qoder", QoderNativeConfig>({
  agentId: "qoder",
  descriptor,
});
