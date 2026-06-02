import type { FilesExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallFilesCommandIntent {
  readonly targets: ReadonlyArray<FilesExtensionTarget>;
}
