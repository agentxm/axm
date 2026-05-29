import type * as Option from "effect/Option";
import type { DocsExtensionRef } from "@agentxm/client-core/unstable/docs";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallDocsCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: DocsExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
