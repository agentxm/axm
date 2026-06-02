import type * as Option from "effect/Option";
import type { HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallHookCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: HookExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
