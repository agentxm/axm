/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 */
export type SkillPathSource =
  | { readonly refType: "registry"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

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
  if (source.refType === "registry") {
    const canonicalPath = join(
      base,
      REGISTRY_EXTENSIONS_DIR,
      source.owner,
      "skills",
      sanitizedName,
    );
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      skillSrcPath: decodeAbsolutePathSync(join(canonicalPath, "src")),
    };
  }
  const canonicalPath = join(base, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName);
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    skillSrcPath: decodeAbsolutePathSync(canonicalPath),
  };
};
