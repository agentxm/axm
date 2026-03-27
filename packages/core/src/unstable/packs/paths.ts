/**
 * Centralized pack path computation.
 *
 * Provides types and a pure function for computing pack directory paths.
 * Packs are always registry-sourced, so there is no non-registry branch.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";

/**
 * Computed path for an installed pack directory.
 *
 * `canonicalPath` = `<base>/.axm/extensions/<profile>/packs/<name>/`
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
 * @param profile - Pack profile (e.g., "@acme")
 * @param name - Pack name for filesystem use
 */
export const computePackPaths = (
  join: (...paths: string[]) => string,
  base: string,
  profile: string,
  name: string,
): PackDirPath => {
  const canonicalPath = join(base, REGISTRY_EXTENSIONS_DIR, profile, "packs", name);
  return { canonicalPath };
};
