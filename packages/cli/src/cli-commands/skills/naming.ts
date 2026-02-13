/**
 * Shared naming utilities for scoped extension names (`@scope/name`).
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Parse `@scope/name` into its parts.
 */
export const parseScopedName = (
  name: string,
): { readonly scope: string; readonly skillName: string } => {
  const slashIdx = name.indexOf("/");
  return {
    scope: name.slice(0, slashIdx),
    skillName: name.slice(slashIdx + 1),
  };
};

/**
 * Determine whether the name already contains a scope (`@scope/name`).
 */
export const hasScopePrefix = (name: string): boolean => name.startsWith("@") && name.includes("/");
