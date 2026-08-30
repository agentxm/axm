import type { WorkspaceScope } from "@agentxm/extension-management/unstable/workspace";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceMutationsService } from "@agentxm/extension-management/unstable/workspace";
import type * as Path from "effect/Path";

/** Stable workspace-relative paths for user-facing plans and results. */
export const workspaceSettingsPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

export const workspaceLockfilePath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml";

export const workspaceCanonicalRoot = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/workspace/agent_extensions";

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

/** Absolute canonical root for content authored in the selected workspace. */
export const workspaceAuthoredRoot = (
  path: Path.Path,
  ws: WorkspaceMutationsService,
  type: ExtensionType,
  owner: string,
): string =>
  ws.layout.scope === "project"
    ? ws.layout.authoredRoot(type)
    : path.join(ws.layout.acquiredRoot, owner, extensionDirectory[type]);
