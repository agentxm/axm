/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { computeExtensionPathsForLayout, type ExtensionPathSource } from "./extension-paths.js";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "./layout.js";

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

export const computeSkillPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: SkillPathSource,
  sanitizedName: string,
): SkillDirPaths => {
  const paths = computeExtensionPathsForLayout(join, layout, source, "skills", sanitizedName);
  return { canonicalPath: paths.canonicalPath, skillSrcPath: paths.extensionSrcPath };
};
