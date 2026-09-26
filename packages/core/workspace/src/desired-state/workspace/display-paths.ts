/** Workspace-relative paths shown in plans, findings, and operation results. */

import type * as Path from "effect/Path";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  LOCKFILE_NAME,
  SETTINGS_FILENAME,
} from "@agentxm/extension-model/unstable/workspace-files";
import { AXM_DIR_NAME } from "@agentxm/host-primitives";
import { ACQUIRED_EXTENSIONS_DIR, USER_WORKSPACE_DIRECTORY } from "./constants.js";
import type { WorkspaceLayout } from "./layout.js";
import type { WorkspaceLocationService } from "./location.js";

export const USER_WORKSPACE_DISPLAY_ROOT = `${AXM_DIR_NAME}/${USER_WORKSPACE_DIRECTORY}`;

export const workspaceFileDisplayPath = (scope: WorkspaceScope, file: string): string =>
  scope === "project" ? file : `${USER_WORKSPACE_DISPLAY_ROOT}/${file}`;

export const settingsDisplayPath = (scope: WorkspaceScope): string =>
  workspaceFileDisplayPath(scope, SETTINGS_FILENAME);

export const lockfileDisplayPath = (scope: WorkspaceScope): string =>
  workspaceFileDisplayPath(scope, LOCKFILE_NAME);

export const acquiredRootDisplayPath = (scope: WorkspaceScope): string =>
  workspaceFileDisplayPath(scope, ACQUIRED_EXTENSIONS_DIR);

/** One acquired package path, relative to the selected workspace root. */
export const acquiredDisplayPath = (scope: WorkspaceScope, relativePath: string): string =>
  `${acquiredRootDisplayPath(scope)}/${relativePath.replace(/^\/+/, "")}`;

/** Where a workspace-authored package of this type and name sits. */
export const authoredDisplayPath = (
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
  return acquiredDisplayPath(location.scope, `${owner}/${toExtensionTypePlural(type)}/${name}`);
};

/** A path under the workspace root, relative to it; any other path unchanged. */
export const workspaceDisplayPath = (root: string, file: string): string => {
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};
