/**
 * Configuration scope helpers for CLI flags.
 *
 * `project` uses `./.axm`, while `user` uses `~/.axm`.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const CONFIGURATION_SCOPES = ["project", "user"] as const;

export type ConfigurationScope = (typeof CONFIGURATION_SCOPES)[number];

export const DEFAULT_CONFIGURATION_SCOPE: ConfigurationScope = "project";

export const resolveConfigurationScope = (
  scope: ConfigurationScope | undefined,
  globalAlias: boolean | undefined,
): ConfigurationScope => {
  if (globalAlias) return "user";
  return scope ?? DEFAULT_CONFIGURATION_SCOPE;
};

export const toGlobalWorkspaceFlag = (scope: ConfigurationScope): boolean => scope === "user";
