/**
 * Centralized subagent path computation.
 *
 * Provides types and a pure function for computing subagent directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";

/**
 * Minimal structural discriminant for determining subagent path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentPathSource =
  | { readonly refType: "registry"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

/**
 * Computed paths for an installed subagent directory.
 *
 * - `canonicalPath`: root of the installed subagent
 * - `subagentSrcPath`: where actual subagent source files live
 *
 * Non-registry: `canonicalPath === subagentSrcPath` = `<base>/.axm/extensions/external/subagents/<sanitized-name>`
 * Registry: `canonicalPath` = `<base>/.axm/extensions/<owner>/subagents/<sanitized-name>`,
 *           `subagentSrcPath` = `<canonicalPath>/src`
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
export const subagentContentFilename = (name: string): string => `${name}.md`;

/**
 * Content path for subagent instructions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const subagentContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => decodeAbsolutePathSync(join(root, subagentContentFilename(name)));

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
  if (source.refType === "registry") {
    const canonicalPath = join(
      base,
      REGISTRY_EXTENSIONS_DIR,
      source.owner,
      "subagents",
      sanitizedName,
    );
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      subagentSrcPath: decodeAbsolutePathSync(join(canonicalPath, "src")),
    };
  }
  const canonicalPath = join(base, EXTERNAL_EXTENSIONS_DIR, "subagents", sanitizedName);
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    subagentSrcPath: decodeAbsolutePathSync(canonicalPath),
  };
};
