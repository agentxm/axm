/**
 * Canonical identity for one accepted MCP source-resolution closure.
 *
 * Connection names deliberately do not participate: several local MCP
 * connections may share this identity and therefore one accepted resolution.
 */

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";

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
export const mcpResolutionKey = (entry: {
  readonly source:
    | { readonly type: "registry"; readonly url: URL }
    | { readonly type: "git"; readonly url: URL }
    | { readonly type: "path"; readonly path: string };
  readonly identity: { readonly owner?: Handle | undefined; readonly name: ExtensionName };
}): string => {
  switch (entry.source.type) {
    case "registry":
      return mcpRegistryResolutionKey({
        authority: entry.source.url,
        owner: entry.identity.owner ?? "",
        name: entry.identity.name,
      });
    case "git":
      return `git:${encodeIdentityPart(normalizeAuthority(entry.source.url))}:${entry.identity.owner ?? ""}/mcps/${entry.identity.name}`;
    case "path":
      return `path:${encodeIdentityPart(entry.source.path)}:${entry.identity.owner ?? ""}/mcps/${entry.identity.name}`;
  }
};
