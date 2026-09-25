import { formatDeprecationWarning } from "@agentxm/registry-client";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

export { formatDeprecationWarning };

/** The lifecycle notices shared by plans and registry package materialization. */
export const extensionRefLifecycleWarnings = (ref: ExtensionRef): ReadonlyArray<string> =>
  ref.refType === "registry"
    ? [
        ...(ref.deprecation === undefined
          ? []
          : [
              formatDeprecationWarning(
                `${ref.owner}/${toExtensionTypePlural(ref.type)}/${ref.name}`,
                ref.deprecation,
              ),
            ]),
        ...(ref.lifecycleWarnings ?? []),
      ]
    : [];
