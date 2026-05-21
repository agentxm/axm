import type { ContextExtensionTarget } from "@agentxm/client-core/unstable/workspace";

export interface UninstallContextCommandIntent {
  readonly targets: ReadonlyArray<ContextExtensionTarget>;
}
