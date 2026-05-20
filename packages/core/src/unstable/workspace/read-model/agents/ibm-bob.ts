/**
 * IBM Bob agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface IbmBobNativeConfig {
  readonly agentId: "ibm-bob";
}

export const agentModule = defineAgentModule<"ibm-bob", IbmBobNativeConfig>({
  agentId: "ibm-bob",
  descriptor: AGENTS["ibm-bob"],
});
