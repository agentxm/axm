import * as Context from "effect/Context";
import type { AccessibleContent } from "@agentxm/registry-client";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

/** Reader supplied only while the client's content-admission callback is active. */
export class RegistryContentAccess extends Context.Service<
  RegistryContentAccess,
  {
    readonly read: (
      ref: Extract<ExtensionRef, { readonly refType: "registry" }>,
      args: Parameters<AccessibleContent["read"]>[0],
    ) => ReturnType<AccessibleContent["read"]>;
  }
>()("@agentxm/workspace-kernel/sources/RegistryContentAccess") {}
