/**
 * Centralized pack path computation.
 *
 * Provides types and a pure function for computing pack directory paths.
 * Packs are either workspace-authored or Registry-sourced. Acquired packs
 * retain the exact Registry source name in their canonical path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "./layout.js";

/**
 * Computed path for an installed pack directory.
 *
 * `canonicalPath` = `<base>/agent_extensions/<source-name>/<owner>/packs/<name>/`
 *
 * No `src/` subdirectory for packs.
 */
export interface PackDirPath {
  readonly canonicalPath: AbsolutePath;
}

export const computePackPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  sourceName: "workspace" | string,
  owner: Handle,
  name: string,
): PackDirPath => ({
  canonicalPath:
    layout.scope === "project" && sourceName === "workspace"
      ? decodeAbsolutePathSync(join(layout.authoredRoot("pack"), name))
      : decodeAbsolutePathSync(join(layout.acquiredRoot, sourceName, owner, "packs", name)),
});
