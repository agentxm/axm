/**
 * Centralized extension pack path computation.
 *
 * Provides types and a pure function for computing extension pack directory paths.
 * Extension packs are always registry-sourced, so there is no non-registry branch.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";

/**
 * Computed path for an installed extension pack directory.
 *
 * `canonicalPath` = `<base>/.axm/extensions/<owner>/packs/<name>/`
 *
 * No `src/` subdirectory for packs.
 */
export interface ExtensionPackDirPath {
  readonly canonicalPath: string;
}

/**
 * Pure function to compute extension pack directory path.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param owner - Extension pack owner (e.g., "@acme")
 * @param name - Extension pack name for filesystem use
 */
export const computeExtensionPackPaths = (
  join: (...paths: string[]) => string,
  base: string,
  owner: Handle,
  name: string,
): ExtensionPackDirPath => {
  const canonicalPath = join(base, REGISTRY_EXTENSIONS_DIR, owner, "packs", name);
  return { canonicalPath };
};
