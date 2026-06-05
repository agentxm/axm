/**
 * github-copilot-cli agent module: typed `nativeConfig` placeholder + projectors.
 *
 * Per design Decision 3 + Decision 10 of the workspace read-model change. v1
 * ships a placeholder `nativeConfig` shape; later changes can tighten the
 * post-decode native-settings shape without touching `WorkspaceReadModel`.
 */

import { AGENTS } from "../../../agents/registry.js";
import { defineAgentModule } from "./types.js";

export interface GithubCopilotCliNativeConfig {
  readonly agentId: "github-copilot-cli";
}

export const agentModule = defineAgentModule<"github-copilot-cli", GithubCopilotCliNativeConfig>({
  agentId: "github-copilot-cli",
  descriptor: AGENTS["github-copilot-cli"],
});
