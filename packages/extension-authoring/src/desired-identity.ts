import {
  parseExtensionFqnParts,
  type ExtensionName,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export type DesiredPackageAuthority = "registry" | "workspace";

export interface DecodedDesiredExtensionIdentity {
  readonly authority: DesiredPackageAuthority;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly fqn: string;
}

const workspacePrefix = "workspace:";

/**
 * Decode the source-qualified identity stored in the desired-state graph.
 *
 * This is deliberately narrower than source-locator parsing: desired graph
 * identities are either validated Registry FQNs or `workspace:` followed by a
 * validated FQN. Unknown authorities fail closed.
 */
export const decodeDesiredExtensionIdentity = (
  identity: string,
): DecodedDesiredExtensionIdentity | undefined => {
  const authority: DesiredPackageAuthority = identity.startsWith(workspacePrefix)
    ? "workspace"
    : "registry";
  const fqn = authority === "workspace" ? identity.slice(workspacePrefix.length) : identity;
  const parsed = parseExtensionFqnParts(fqn);
  if (parsed === undefined) return undefined;

  return {
    authority,
    owner: parsed.owner,
    type: parsed.type,
    name: parsed.name,
    fqn,
  };
};
