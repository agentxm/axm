import type * as Option from "effect/Option";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

export interface InstallHookCommandIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<{
    readonly ref: HookExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
