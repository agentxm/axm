import type * as Option from "effect/Option";
import type { ContextExtensionRef } from "@agentxm/client-core/unstable/context";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallContextCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: ContextExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
