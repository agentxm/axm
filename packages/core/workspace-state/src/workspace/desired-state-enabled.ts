/**
 * Shared origin-precedence semantics for desired extension nodes.
 *
 * An explicit disabled settings entry is user intent and overrides pack
 * membership. Otherwise any enabled settings origin or pack origin activates
 * the extension.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type DesiredStateEnabledOrigin =
  | { readonly type: "settings"; readonly enabled: boolean }
  | { readonly type: "pack"; readonly enabled: boolean };

export const isDesiredExtensionActive = (
  origins: ReadonlyArray<DesiredStateEnabledOrigin>,
): boolean => {
  const settingsOrigin = origins.find((origin) => origin.type === "settings");
  if (settingsOrigin?.enabled === false) return false;
  return origins.some((origin) => origin.enabled);
};
