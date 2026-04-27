/**
 * kilo agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/kilo/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface KiloNativeConfig {
  readonly agentId: "kilo";
}

export const agentModule = defineAgentModule<"kilo", KiloNativeConfig>({
  agentId: "kilo",
  descriptor,
});
