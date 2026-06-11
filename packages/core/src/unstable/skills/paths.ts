/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { computeExtensionPaths, type ExtensionPathSource } from "../extensions/index.js";
import type { AbsolutePath } from "../utils/path-types.js";

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 */
export type SkillPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed skill directory.
 *
 * - `canonicalPath`: root of the installed skill
 * - `skillSrcPath`: where actual skill source files live
 *
 * Non-registry: `canonicalPath === skillSrcPath` = `<base>/.axm/extensions/external/skills/<sanitized-name>`
 * Registry: `canonicalPath` = `<base>/.axm/extensions/<owner>/skills/<sanitized-name>`,
 *           `skillSrcPath` = `<canonicalPath>/src`
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
  const paths = computeExtensionPaths(join, base, "skills", source, sanitizedName);
  return {
    canonicalPath: paths.canonicalPath,
    skillSrcPath: paths.sourcePath,
  };
};
