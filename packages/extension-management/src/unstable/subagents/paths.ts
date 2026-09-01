/**
 * Centralized subagent path computation.
 *
 * Provides types and a pure function for computing subagent directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  computeExtensionPathsForLayout,
  extensionContentFilename,
  extensionContentPath,
  type ExtensionPathSource,
} from "@agentxm/workspace-state";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "@agentxm/workspace-state";

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

export const computeSubagentPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: SubagentPathSource,
  sanitizedName: string,
): SubagentDirPaths => {
  const paths = computeExtensionPathsForLayout(join, layout, source, "subagents", sanitizedName);
  return { canonicalPath: paths.canonicalPath, subagentSrcPath: paths.extensionSrcPath };
};
