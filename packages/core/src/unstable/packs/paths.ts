/**
 * Centralized pack path computation.
 *
 * Provides types and a pure function for computing pack directory paths.
 * Packs are either workspace-authored or Registry-sourced. Acquired packs
 * retain the exact Registry source name in their canonical path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

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

/**
 * Pure function to compute pack directory path.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param owner - Pack owner (e.g., "@acme")
 * @param name - Pack name for filesystem use
 */
export const computePackPaths = (
  join: (...paths: string[]) => string,
  base: string,
  sourceName: string,
  owner: Handle,
  name: string,
): PackDirPath => {
  const canonicalPath = join(base, REGISTRY_EXTENSIONS_DIR, sourceName, owner, "packs", name);
  return { canonicalPath: decodeAbsolutePathSync(canonicalPath) };
};

/** Resolve a conventionally placed workspace-authored Pack. */
export const computeAuthoredPackPaths = (
  join: (...paths: string[]) => string,
  base: string,
  name: string,
): PackDirPath => ({
  canonicalPath: decodeAbsolutePathSync(join(base, "packs", name)),
});

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
      : layout.scope === "project"
        ? decodeAbsolutePathSync(join(layout.acquiredRoot, sourceName, owner, "packs", name))
        : decodeAbsolutePathSync(join(layout.canonicalRoot, sourceName, owner, "packs", name)),
});
