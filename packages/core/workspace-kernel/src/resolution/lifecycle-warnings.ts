import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

export const formatDeprecationWarning = (
  extensionRef: string,
  deprecation: DeprecationView,
): string => {
  const guidance = [
    `Reason: ${deprecation.reason}`,
    deprecation.message,
    deprecation.replacement?.status === "available"
      ? `Use ${deprecation.replacement.fqn}`
      : deprecation.replacement === undefined
        ? undefined
        : deprecation.replacement.fqn === undefined
          ? "The suggested replacement is unavailable or not visible"
          : `The suggested replacement ${deprecation.replacement.fqn} is unavailable`,
  ].filter((value): value is string => value !== undefined);
  const action =
    deprecation.reason === "obsolete" ||
    (deprecation.reason === "superseded" && deprecation.replacement.status === "available")
      ? `Run axm migrate ${extensionRef} --preview to preview migration`
      : deprecation.reason === "superseded"
        ? `Inspect axm view ${extensionRef}; the replacement is unavailable`
        : `Inspect axm view ${extensionRef} and choose a successor manually`;
  return guidance.length === 0
    ? `${extensionRef} is deprecated. ${action}`
    : `${extensionRef} is deprecated: ${guidance.join(". ")}. ${action}`;
};

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
