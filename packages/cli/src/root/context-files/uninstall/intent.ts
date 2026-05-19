import type { ContextFilesExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallContextFilesCommandIntent {
  readonly targets: ReadonlyArray<ContextFilesExtensionTarget>;
}
