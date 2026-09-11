/**
 * Stable workspace-relative paths a plan and its result name.
 *
 * A removal reports what it touched — settings, the lockfile, the canonical
 * package — as paths a person can open. They are derived from the workspace
 * layout rather than from where the workspace happens to sit on disk, so the
 * same operation reads identically from any checkout.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Path from "effect/Path";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";

/** Where the workspace's settings file sits, relative to the workspace root. */
export const workspaceSettingsPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

/** Where the workspace's lockfile sits, relative to the workspace root. */
export const workspaceLockfilePath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml";

/** The root every acquired package sits under, relative to the workspace root. */
export const workspaceCanonicalRoot = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/workspace/agent_extensions";

/** One acquired package's path, relative to the workspace root. */
export const workspaceCanonicalPath = (scope: WorkspaceScope, relativePath: string): string =>
  `${workspaceCanonicalRoot(scope)}/${relativePath.replace(/^\/+/, "")}`;

const extensionDirectory = {
  skill: "skills",
  "mcp-server": "mcps",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<ExtensionType, string>;

/** Where one desired-graph node's package sits, authored or acquired. */
export const workspaceCanonicalNodePath = (
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
  return workspaceCanonicalPath(ws.scope, identity);
};

/** Where a workspace-authored package of this type and name sits. */
export const workspaceAuthoredPath = (
  path: Path.Path,
  ws: WorkspaceMutationsService,
  type: ExtensionType,
  name: string,
): string => {
  if (ws.layout.scope === "project") {
    return path.join(path.relative(ws.baseDir, ws.layout.authoredRoot(type)), name);
  }
  const owner = ws.layout.owner ?? "@workspace";
  return workspaceCanonicalPath(ws.scope, `${owner}/${extensionDirectory[type]}/${name}`);
};
