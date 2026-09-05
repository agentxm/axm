import type { KnowledgeExtensionTarget } from "@agentxm/workspace-state";

export interface UninstallKnowledgeCommandIntent {
  readonly targets: ReadonlyArray<KnowledgeExtensionTarget>;
}
