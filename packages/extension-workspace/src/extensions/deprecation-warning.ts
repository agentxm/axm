/**
 * Registry deprecation warning formatting.
 *
 * Deliberately duplicated from the registry-client integration: the kernel
 * may not depend on integrations, and this pure formatter is within the
 * sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";

export const formatDeprecationWarning = (
  extensionRef: string,
  deprecation: DeprecationView,
): string => {
  const guidance = [
    deprecation.message,
    deprecation.replacement?.status === "available"
      ? `Use ${deprecation.replacement.fqn}`
      : deprecation.replacement === undefined
        ? undefined
        : deprecation.replacement.fqn === undefined
          ? "The suggested replacement is unavailable or not visible"
          : `The suggested replacement ${deprecation.replacement.fqn} is unavailable`,
  ].filter((value): value is string => value !== undefined);
  return guidance.length === 0
    ? `${extensionRef} is deprecated`
    : `${extensionRef} is deprecated: ${guidance.join(". ")}`;
};
