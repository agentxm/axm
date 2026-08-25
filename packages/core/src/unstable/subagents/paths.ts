/**
 * Centralized subagent path computation.
 *
 * Provides types and a pure function for computing subagent directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  computeExtensionPaths,
  computeExtensionPathsForLayout,
  extensionContentFilename,
  extensionContentPath,
  type ExtensionPathSource,
} from "../extensions/extension-paths.js";
import type { AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

/**
 * Minimal structural discriminant for determining subagent path layout.
 *
 * Every acquired ref carries enough source coordinates to derive its
 * source-qualified canonical path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed subagent directory.
 *
 * - `canonicalPath`: root of the installed subagent
 * - `subagentSrcPath`: where actual subagent source files live
 *
 * Native packages use `<canonicalPath>/src`; portable acquired formats use
 * the source-qualified package root directly when supported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly subagentSrcPath: AbsolutePath;
}

/**
 * Content filename for subagent instructions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const subagentContentFilename = extensionContentFilename;

/**
 * Content path for subagent instructions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const subagentContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => extensionContentPath(join, root, name);

/**
 * Pure function to compute subagent directory paths.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param source - Source type discriminant
 * @param sanitizedName - Sanitized subagent name for filesystem use
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeSubagentPaths = (
  join: (...paths: string[]) => string,
  base: string,
  source: SubagentPathSource,
  sanitizedName: string,
): SubagentDirPaths => {
  const paths = computeExtensionPaths(join, base, source, "subagents", sanitizedName);
  return {
    canonicalPath: paths.canonicalPath,
    subagentSrcPath: paths.extensionSrcPath,
  };
};

export const computeSubagentPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: SubagentPathSource,
  sanitizedName: string,
): SubagentDirPaths => {
  const paths = computeExtensionPathsForLayout(join, layout, source, "subagents", sanitizedName);
  return { canonicalPath: paths.canonicalPath, subagentSrcPath: paths.extensionSrcPath };
};
