import type * as Option from "effect/Option";
import type { RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallRuleCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: RuleExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
