/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { RefType } from "../../sources/index.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../constants.js";

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Registry refs carry a namespace for the canonical path; all other ref types
 * use the shared external extensions directory.
 */
export type SkillPathSource =
  | { readonly refType: "registry"; readonly namespace: string }
  | { readonly refType: Exclude<RefType, "registry"> };

/**
 * Computed paths for an installed skill directory.
 *
 * - `canonicalPath`: root of the installed skill
 * - `skillSrcPath`: where actual skill source files live
 *
 * Non-registry: `canonicalPath === skillSrcPath` = `<base>/.axm/extensions/external/skills/<sanitized-name>`
 * Registry: `canonicalPath` = `<base>/.axm/extensions/<namespace>/skills/<sanitized-name>`,
 *           `skillSrcPath` = `<canonicalPath>/src`
 */
export interface SkillDirPaths {
  readonly canonicalPath: string;
  readonly skillSrcPath: string;
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
      source.namespace,
      "skills",
      sanitizedName,
    );
    return { canonicalPath, skillSrcPath: join(canonicalPath, "src") };
  }
  const canonicalPath = join(base, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName);
  return { canonicalPath, skillSrcPath: canonicalPath };
};
