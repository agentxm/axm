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
import type { WorkspaceLayout, WorkspaceLocationService } from "../desired-state/index.js";

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

/** Where a workspace-authored package of this type and name sits. */
export const workspaceAuthoredPath = (
  path: Path.Path,
  location: WorkspaceLocationService,
  layout: WorkspaceLayout,
  type: ExtensionType,
  name: string,
): string => {
  if (layout.scope === "project") {
    return path.join(path.relative(location.baseDir, layout.authoredRoot(type)), name);
  }
  const owner = layout.owner ?? "@workspace";
  return workspaceCanonicalPath(location.scope, `${owner}/${extensionDirectory[type]}/${name}`);
};
