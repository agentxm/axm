import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";

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
      ? `Run axm migrate ${extensionRef} --dry-run to preview migration`
      : deprecation.reason === "superseded"
        ? `Inspect axm view ${extensionRef}; the replacement is unavailable`
        : `Inspect axm view ${extensionRef} and choose a successor manually`;
  return guidance.length === 0
    ? `${extensionRef} is deprecated. ${action}`
    : `${extensionRef} is deprecated: ${guidance.join(". ")}. ${action}`;
};
