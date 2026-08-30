import type * as Option from "effect/Option";
import type { RuleExtensionRef } from "@agentxm/extension-management/unstable/rules";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

export interface InstallRuleCommandIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<{
    readonly ref: RuleExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
}
