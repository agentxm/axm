import type * as Option from "effect/Option";
import type { ContextFilesExtensionRef } from "@agentxm/client-core/unstable/context-files";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallContextFilesCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: ContextFilesExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
