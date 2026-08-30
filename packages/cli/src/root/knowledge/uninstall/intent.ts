import type { KnowledgeExtensionTarget } from "@agentxm/extension-management/unstable/workspace";

export interface UninstallKnowledgeCommandIntent {
  readonly targets: ReadonlyArray<KnowledgeExtensionTarget>;
}
