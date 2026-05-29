import type { DocsExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallDocsCommandIntent {
  readonly targets: ReadonlyArray<DocsExtensionTarget>;
}
