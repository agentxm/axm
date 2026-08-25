/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  computeExtensionPaths,
  computeExtensionPathsForLayout,
  type ExtensionPathSource,
} from "../extensions/extension-paths.js";
import type { AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Every acquired ref carries enough source coordinates to derive its
 * source-qualified canonical path.
 */
export type SkillPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed skill directory.
 *
 * - `canonicalPath`: root of the installed skill
 * - `skillSrcPath`: where actual skill source files live
 *
 * Native packages use `<canonicalPath>/src`; portable Agent Skills use the
 * source-qualified package root directly.
 */
export interface SkillDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly skillSrcPath: AbsolutePath;
}

/**
 * Pure function to compute skill directory paths.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param source - Source type discriminant
 * @param sanitizedName - Sanitized skill name for filesystem use
 */
export const computeSkillPaths = (
  join: (...paths: string[]) => string,
  base: string,
  source: SkillPathSource,
  sanitizedName: string,
): SkillDirPaths => {
  const paths = computeExtensionPaths(join, base, source, "skills", sanitizedName);
  return {
    canonicalPath: paths.canonicalPath,
    skillSrcPath: paths.extensionSrcPath,
  };
};

export const computeSkillPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: SkillPathSource,
  sanitizedName: string,
): SkillDirPaths => {
  const paths = computeExtensionPathsForLayout(join, layout, source, "skills", sanitizedName);
  return { canonicalPath: paths.canonicalPath, skillSrcPath: paths.extensionSrcPath };
};
