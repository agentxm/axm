import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  AgentIdSchema,
  SUPPORTED_LIFECYCLE,
  agentById,
  type AgentId,
  type ConfigFileLocation,
  type PermissionsExtensionCapability,
} from "@agentxm/client-core/unstable/agent-capabilities";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";

const decodeAgentIdOption = Schema.decodeUnknownOption(AgentIdSchema);

const toCatalogAgentId = (id: string): Option.Option<AgentId> => decodeAgentIdOption(id);

const withoutHomePrefix = (path: string): string => (path.startsWith("~/") ? path.slice(2) : path);

const matchingProjectConfig = (
  shellTarget: string | undefined,
  configFiles: ReadonlyArray<ConfigFileLocation>,
): ConfigFileLocation | undefined => {
  if (shellTarget === undefined) return undefined;

  const normalizedTarget = withoutHomePrefix(shellTarget);
  return configFiles.find(
    (configFile) => configFile.scope === "project" && configFile.path === normalizedTarget,
  );
};

const preferredTarget = (
  permissions: PermissionsExtensionCapability,
): ConfigFileLocation | undefined => {
  const configFiles = "configFiles" in permissions ? permissions.configFiles : [];
  const shellTarget = "grants" in permissions ? permissions.grants["shell"]?.target : undefined;

  return (
    matchingProjectConfig(shellTarget, configFiles) ??
    configFiles.find((configFile) => configFile.path === shellTarget) ??
    configFiles.find((configFile) => configFile.scope === "project") ??
    configFiles.find((configFile) => configFile.scope === "user")
  );
};

const prefersCliFlags = (permissions: PermissionsExtensionCapability): boolean =>
  "mechanism" in permissions &&
  permissions.mechanism.includes("cli-flag") &&
  ("configFiles" in permissions ? permissions.configFiles.length === 0 : true);

/**
 * Build one permission suggestion per cataloged agent with permissions data.
 */
export const buildPermissionSuggestions = (
  agentIds: ReadonlyArray<string>,
): ReadonlyArray<SuggestedAction> =>
  agentIds.flatMap((id) =>
    Option.match(toCatalogAgentId(id), {
      onNone: (): ReadonlyArray<SuggestedAction> => [],
      onSome: (agentId) => {
        const agent = agentById(agentId);
        const permissions = agent.permissions;
        if (permissions.lifecycle !== SUPPORTED_LIFECYCLE) return [];

        const target = preferredTarget(permissions);
        const example = permissions.grammar?.example;
        const docUrl = permissions.sources[0];

        const description =
          target === undefined
            ? prefersCliFlags(permissions) && example !== undefined
              ? `Allow AXM in ${agent.name} with \`${example}\``
              : `Configure ${agent.name} to allow AXM without per-call prompts`
            : `Allow AXM in ${agent.name} by adding ${
                example === undefined ? "" : `\`${example}\` `
              }to \`${target.path}\``;

        return docUrl === undefined ? [{ description }] : [{ description, url: docUrl }];
      },
    }),
  );
