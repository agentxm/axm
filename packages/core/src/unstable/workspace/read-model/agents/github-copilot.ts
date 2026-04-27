/**
 * github-copilot agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { descriptor } from "../../../agents/github-copilot/descriptor.js";
import { defineAgentModule } from "./types.js";

export interface GithubCopilotNativeConfig {
  readonly agentId: "github-copilot";
}

export const agentModule = defineAgentModule<"github-copilot", GithubCopilotNativeConfig>({
  agentId: "github-copilot",
  descriptor,
});
