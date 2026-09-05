import type { RuleExtensionTarget } from "@agentxm/workspace-state";

export interface UninstallRuleCommandIntent {
  readonly targets: ReadonlyArray<RuleExtensionTarget>;
}
