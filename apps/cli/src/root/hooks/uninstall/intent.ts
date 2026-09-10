import type { HookExtensionTarget } from "@agentxm/workspace-state";

export interface UninstallHookCommandIntent {
  readonly targets: ReadonlyArray<HookExtensionTarget>;
}
