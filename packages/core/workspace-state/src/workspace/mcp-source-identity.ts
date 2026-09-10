/**
 * Canonical identity for one accepted MCP source-resolution closure.
 *
 * Connection names deliberately do not participate: several local MCP
 * connections may share this identity and therefore one accepted resolution.
 */

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";
import type { McpServerLockEntry } from "../lockfile/schema.js";

const normalizeAuthority = (authority: URL | string): string => {
  const raw = authority instanceof URL ? authority.href : authority;
  try {
    const normalized = new URL(raw).href;
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
  }
};

const encodeIdentityPart = (value: string): string => encodeURIComponent(value);

export const mcpRegistryResolutionKey = (args: {
  readonly authority: URL | string;
  readonly owner: Handle | string;
  readonly name: ExtensionName | string;
}): string =>
  `registry:${encodeIdentityPart(normalizeAuthority(args.authority))}:${args.owner}/mcps/${args.name}`;

/** Deterministic lock-map key for every currently accepted MCP source class. */
export const mcpResolutionKey = (entry: McpServerLockEntry): string => {
  switch (entry.type) {
    case "registry":
      return mcpRegistryResolutionKey({
        authority: entry.endpoint,
        owner: entry.owner,
        name: entry.name,
      });
    case "github":
    case "gitlab":
    case "bitbucket":
      return `${entry.type}:${encodeIdentityPart(normalizeAuthority(entry.endpoint))}:${entry.owner}/${entry.repo}:${entry.packageOwner ?? ""}/mcps/${entry.packageName}`;
    case "azurerepos":
      return `azurerepos:${encodeIdentityPart(normalizeAuthority(entry.endpoint))}:${entry.organization}/${entry.project}/${entry.repo}:${entry.packageOwner ?? ""}/mcps/${entry.packageName}`;
    case "git":
      return `git:${encodeIdentityPart(normalizeAuthority(entry.url))}:${entry.packageOwner ?? ""}/mcps/${entry.packageName}`;
    case "local":
      return `local:${encodeIdentityPart(entry.path)}:${entry.packageOwner ?? ""}/mcps/${entry.packageName}`;
  }
};
