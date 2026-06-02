import type * as Option from "effect/Option";
import type { FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallFilesCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: FilesExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
