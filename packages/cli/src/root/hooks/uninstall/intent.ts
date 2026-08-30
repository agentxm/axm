import type { HookExtensionTarget } from "@agentxm/extension-management/unstable/workspace";

export interface UninstallHookCommandIntent {
  readonly targets: ReadonlyArray<HookExtensionTarget>;
}
