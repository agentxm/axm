/**
 * The identity a configured declaration names, derived from the settings
 * entry and the Registry bindings in force. Collection and evaluation both
 * derive it from the same inputs, so the document a Pack is located at and
 * the Pack node the evaluation settles agree by construction.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { PackLockEntry } from "../desired/lockfile/schema.js";
import type { Settings } from "../desired/settings/index.js";
import {
  locatorAuthority,
  type DesiredNodeIdentity,
  type DesiredSourceAuthority,
} from "./desired-identity.js";
import type { ProspectivePackRef } from "./desired-state-graph.js";
import { mcpRegistryResolutionKey } from "./mcp-source-identity.js";
import { packMemberSourceAuthority } from "./pack-member-source-authority.js";
import { bindRegistrySource } from "./settings-reader.js";

/** The graph key one local name settles under. */
export const desiredNodeKey = (type: ExtensionType, name: string): string => `${type}:${name}`;

/** The Registry identity of one declaration, bound to its configured source. */
export const registryIdentity = (
  type: ExtensionType,
  parsed: { readonly owner: string; readonly name: string },
  fqn: string,
  binding: { readonly sourceName: string | undefined; readonly endpoint: URL | undefined },
): Extract<DesiredNodeIdentity, { readonly authority: "registry" }> => ({
  authority: "registry",
  fqn,
  registry: binding,
  ...(type === "mcp-server" && binding.endpoint !== undefined
    ? {
        resolutionKey: mcpRegistryResolutionKey({
          authority: binding.endpoint,
          owner: parsed.owner,
          name: parsed.name,
        }),
      }
    : {}),
});

/** The identity a direct declaration's source locator names, and the range it spells. */
export const sourceIdentity = (
  type: ExtensionType,
  name: string,
  source: string,
  settings: Settings,
  defaultRegistry: string,
  registryEndpoints: Readonly<Record<string, URL>>,
): { readonly identity: DesiredNodeIdentity; readonly constraint?: string } => {
  if (isWorkspaceSourceLocator(source)) {
    // A missing owner is reported as a problem beside this node; the identity
    // still names the package so the node keeps its place in the graph.
    return {
      identity: {
        authority: "workspace",
        fqn: `${settings.owner ?? "@workspace"}/${toExtensionTypePlural(type)}/${name}`,
      },
    };
  }

  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (
    parsed !== undefined &&
    parsed.type === toExtensionTypePlural(type) &&
    parsed.name !== undefined
  ) {
    const sourceName = bindRegistrySource(parsed.sourceName, defaultRegistry);
    const fqn = `${parsed.owner}/${parsed.type}/${parsed.name}`;
    return {
      identity: registryIdentity(type, { owner: parsed.owner, name: parsed.name }, fqn, {
        sourceName,
        endpoint: registryEndpoints[sourceName],
      }),
      ...(parsed.versionRange === undefined ? {} : { constraint: parsed.versionRange }),
    };
  }

  return { identity: { authority: locatorAuthority(source), locator: source } };
};

/** What a configured Pack entry identifies, once its source is understood. */
export interface ConfiguredPackIdentity {
  readonly owner: Handle;
  readonly name: string;
  readonly fqn: string;
  /** The Pack node's own identity. */
  readonly identity: DesiredNodeIdentity;
  readonly constraint?: string;
}

/**
 * The identity one `packs` settings entry names. A held git or path Pack is
 * named by its accepted resolution, or by the proposal that is about to
 * accept it; an entry naming neither cannot be identified.
 */
export const configuredPackIdentity = (
  settingsName: string,
  source: string,
  settings: Settings,
  defaultRegistry: string,
  registryEndpoints: Readonly<Record<string, URL>>,
  accepted: PackLockEntry | undefined,
  prospective: ProspectivePackRef | undefined,
): ConfiguredPackIdentity | undefined => {
  if (isWorkspaceSourceLocator(source)) {
    if (settings.owner === undefined) return undefined;
    const fqn = `${settings.owner}/packs/${settingsName}`;
    return {
      owner: settings.owner,
      name: settingsName,
      fqn,
      identity: { authority: "workspace", fqn },
    };
  }

  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parsed !== undefined && parsed.type === "packs" && parsed.name !== undefined) {
    const sourceName = bindRegistrySource(parsed.sourceName, defaultRegistry);
    const fqn = `${parsed.owner}/packs/${parsed.name}`;
    return {
      owner: parsed.owner,
      name: parsed.name,
      fqn,
      identity: registryIdentity("pack", { owner: parsed.owner, name: parsed.name }, fqn, {
        sourceName,
        endpoint: registryEndpoints[sourceName],
      }),
      ...(parsed.versionRange === undefined ? {} : { constraint: parsed.versionRange }),
    };
  }

  if (source === "registry" && settings.owner !== undefined) {
    const fqn = `${settings.owner}/packs/${settingsName}`;
    return {
      owner: settings.owner,
      name: settingsName,
      fqn,
      identity: registryIdentity("pack", { owner: settings.owner, name: settingsName }, fqn, {
        sourceName: defaultRegistry,
        endpoint: registryEndpoints[defaultRegistry],
      }),
    };
  }

  const owner = accepted?.identity.owner ?? prospective?.owner;
  const name = accepted?.identity.name ?? prospective?.pack.name;
  if (owner !== undefined && name !== undefined) {
    const fqn = `${owner}/packs/${name}`;
    const authority =
      accepted?.source.type === "registry"
        ? "registry"
        : accepted === undefined
          ? locatorAuthority(source)
          : accepted.source.type;
    return {
      owner,
      name,
      fqn,
      identity:
        authority === "registry"
          ? registryIdentity("pack", { owner, name }, fqn, {
              sourceName: undefined,
              endpoint: accepted?.source.type === "registry" ? accepted.source.url : undefined,
            })
          : { authority, locator: source, fqn },
    };
  }

  return undefined;
};

/** The source family a configured Pack's document is materialized under. */
export const configuredPackSourceFamily = (
  source: string,
  accepted: PackLockEntry | undefined,
): "git" | "path" | "registry" | "workspace" =>
  isWorkspaceSourceLocator(source)
    ? "workspace"
    : accepted?.source.type === "path"
      ? "path"
      : accepted === undefined || accepted.source.type === "registry"
        ? "registry"
        : "git";

/**
 * The source a Pack's members inherit: the workspace for an authored Pack,
 * the accepted source view for a held one, else the Pack's configured Registry.
 */
export const inheritedMemberSourceAuthority = (
  configuredSource: string,
  accepted: PackLockEntry | undefined,
  workspaceFqn: string,
  registryEndpoint: URL | undefined,
): DesiredSourceAuthority | undefined => {
  if (isWorkspaceSourceLocator(configuredSource)) {
    return { authority: "workspace", fqn: workspaceFqn };
  }
  if (accepted !== undefined)
    return packMemberSourceAuthority({ kind: "accepted", entry: accepted });
  return registryEndpoint === undefined
    ? undefined
    : { authority: "registry", endpoint: registryEndpoint };
};

/** The Registry source a Pack's unqualified member declarations bind to. */
export const configuredPackRegistrySource = (
  identity: ConfiguredPackIdentity,
  defaultRegistry: string,
): string =>
  bindRegistrySource(
    Option.fromUndefinedOr(
      identity.identity.authority === "registry"
        ? identity.identity.registry.sourceName
        : undefined,
    ),
    defaultRegistry,
  );
