import type { KnowledgeExtensionRef } from "@agentxm/client-core/unstable/knowledge";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type * as Option from "effect/Option";

export interface InstallKnowledgeCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
