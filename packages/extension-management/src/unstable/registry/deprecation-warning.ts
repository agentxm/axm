import type { DeprecationView } from "@agentxm/registry-protocol/unstable/registry/schema";

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
