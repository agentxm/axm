import type { KnowledgeExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallKnowledgeCommandIntent {
  readonly targets: ReadonlyArray<KnowledgeExtensionTarget>;
}
