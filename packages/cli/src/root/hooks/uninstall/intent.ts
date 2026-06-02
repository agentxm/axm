import type { HookExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallHookCommandIntent {
  readonly targets: ReadonlyArray<HookExtensionTarget>;
}
