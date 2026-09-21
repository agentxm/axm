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

/**
 * Activation once a Pack-member configuration entry has had its say.
 *
 * A configuration-only entry states a preference about a member some Pack
 * supplies: an explicit value decides activation, and an omitted one inherits
 * whatever the declared routes produce. It cannot reach a member no route
 * supplies, because a node only exists where one does.
 *
 * Every place that recomputes activation from origins goes through here, so a
 * preference cannot be dropped by a later pass over the graph.
 */
export const effectiveExtensionActivation = (
  origins: ReadonlyArray<DesiredStateEnabledOrigin>,
  preference: { readonly enabled?: boolean } | undefined,
): boolean => preference?.enabled ?? isDesiredExtensionActive(origins);
