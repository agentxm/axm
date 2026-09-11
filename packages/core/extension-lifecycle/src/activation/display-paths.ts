/**
 * Stable workspace-relative paths an activation plan shows the operator.
 *
 * Deliberately duplicated from the application's display-path helper: a
 * feature package may not depend on application presentation utilities, and
 * these are small pure functions over the workspace scope, within the
 * sanctioned duplication budget.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Path from "effect/Path";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";

export const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

export const lockfileDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml";

export const canonicalRootDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/workspace/agent_extensions";

export const canonicalDisplayPath = (scope: WorkspaceScope, relativePath: string): string =>
  `${canonicalRootDisplayPath(scope)}/${relativePath.replace(/^\/+/, "")}`;

/** Where a desired node's canonical content lives, workspace-relative. */
export const canonicalNodeDisplayPath = (
  path: Path.Path,
  ws: WorkspaceMutationsService,
  node: {
    readonly type: ExtensionType;
    readonly name: string;
    readonly identity: string;
  },
): string => {
  if (node.identity.startsWith("workspace:") && ws.layout.scope === "project") {
    return path.join(path.relative(ws.baseDir, ws.layout.authoredRoot(node.type)), node.name);
  }
  const identity = node.identity.startsWith("workspace:")
    ? node.identity.slice("workspace:".length)
    : node.identity;
  return canonicalDisplayPath(ws.scope, identity);
};
