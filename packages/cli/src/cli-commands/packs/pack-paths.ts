/**
 * Centralized pack path computation.
 *
 * Provides types and a pure function for computing pack directory paths.
 * Packs are always registry-sourced, so there is no non-registry branch.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/constants.js";

/**
 * Computed path for an installed pack directory.
 *
 * `canonicalPath` = `<base>/.axm/extensions/<scope>/packs/<name>/`
 *
 * No `src/` subdirectory for packs.
 */
export interface PackDirPath {
  readonly canonicalPath: string;
}

/**
 * Pure function to compute pack directory path.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param scope - Pack scope (e.g., "@acme")
 * @param name - Pack name for filesystem use
 */
export const computePackPaths = (
  join: (...paths: string[]) => string,
  base: string,
  scope: string,
  name: string,
): PackDirPath => {
  const canonicalPath = join(base, REGISTRY_EXTENSIONS_DIR, scope, "packs", name);
  return { canonicalPath };
};
