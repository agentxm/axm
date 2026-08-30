import type { RuleExtensionTarget } from "@agentxm/extension-management/unstable/workspace";

export interface UninstallRuleCommandIntent {
  readonly targets: ReadonlyArray<RuleExtensionTarget>;
}
