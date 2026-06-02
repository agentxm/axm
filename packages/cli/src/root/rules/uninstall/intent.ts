import type { RuleExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallRuleCommandIntent {
  readonly targets: ReadonlyArray<RuleExtensionTarget>;
}
