import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  AgentIdSchema,
  SUPPORTED_AXM_SUPPORT,
  agentById,
  type AgentId,
  type NativeConfigReadLocation,
  type PermissionsExtensionCapability,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

const decodeAgentIdOption = Schema.decodeUnknownOption(AgentIdSchema);

const toCatalogAgentId = (id: string): Option.Option<AgentId> => decodeAgentIdOption(id);

const preferredTarget = (
  permissions: PermissionsExtensionCapability,
  scope: NativeConfigReadLocation["scope"],
): NativeConfigReadLocation | undefined => {
  const locations = ("locations" in permissions.native ? permissions.native.locations : []).filter(
    (location) => location.scope === scope,
  );
  const destination = permissions.axm.writer?.grants["shell"]?.destination;
  return (
    (destination?.kind === "location"
      ? locations.find((location) => location.id === destination.locationId)
      : undefined) ?? locations[0]
  );
};

const displayTarget = (location: NativeConfigReadLocation): string =>
  location.root === "project"
    ? location.path
    : location.root === "xdg-config"
      ? `~/.config/${location.path}`
      : `~/${location.path}`;

// Mirrors SuggestedActionSchema's runnable-command check: a description that
// embeds `axm ` anywhere is rejected unless it carries a `cmd`, so an example
// containing one can never be inlined, not just one that starts with it.
const looksLikeRunnableAxmCommand = (example: string): boolean => /`?axm\s/.test(example);

const descriptionExample = (example: string | undefined): string | undefined =>
  example === undefined || looksLikeRunnableAxmCommand(example) ? undefined : example;

/**
 * Build one permission suggestion per cataloged agent with permissions data.
 */
export const buildPermissionSuggestions = (
  agentIds: ReadonlyArray<string>,
  scope: NativeConfigReadLocation["scope"],
): ReadonlyArray<SuggestedAction> =>
  agentIds.flatMap((id) =>
    Option.match(toCatalogAgentId(id), {
      onNone: (): ReadonlyArray<SuggestedAction> => [],
      onSome: (agentId) => {
        const agent = agentById(agentId);
        const permissions = agent.permissions;
        if (
          permissions.axm.status !== SUPPORTED_AXM_SUPPORT ||
          permissions.native.availability.via === "none"
        ) {
          return [];
        }

        const target = preferredTarget(permissions, scope);
        const example =
          "grammar" in permissions.native ? permissions.native.grammar?.example : undefined;
        const inlineExample = descriptionExample(example);
        const docUrl = permissions.native.sources[0];

        const destination = permissions.axm.writer?.grants["shell"]?.destination;
        const description =
          destination?.kind === "invocation" && example !== undefined
            ? `Allow AXM in ${agent.name} with \`${example}\``
            : destination?.kind === "settings-ui"
              ? `Configure ${agent.name} to allow AXM in its settings UI`
              : target === undefined
                ? "mechanism" in permissions.native &&
                  permissions.native.mechanism.includes("cli-flag") &&
                  example !== undefined
                  ? `Allow AXM in ${agent.name} with \`${example}\``
                  : `Configure ${agent.name} to allow AXM without per-call prompts`
                : `Allow AXM in ${agent.name} by adding ${
                    inlineExample === undefined ? "a permission rule " : `\`${inlineExample}\` `
                  }to \`${displayTarget(target)}\``;

        return docUrl === undefined ? [{ description }] : [{ description, url: docUrl }];
      },
    }),
  );
