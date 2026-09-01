import type { KnowledgeExtensionRef } from "@agentxm/extension-management/unstable/workspace";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type * as Option from "effect/Option";

export interface InstallKnowledgeCommandIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<{
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
