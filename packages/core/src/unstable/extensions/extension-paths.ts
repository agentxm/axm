/**
 * Shared extension directory path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Handle } from "./handle.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";
import type { ExtensionTypePlural } from "./common.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";

/**
 * Minimal structural discriminant for determining installed extension path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionPathSource =
  | { readonly refType: "registry" | "workspace"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

/**
 * Computed paths for an installed extension directory.
 *
 * - `canonicalPath`: root of the installed extension
 * - `extensionSrcPath`: where actual extension source files live
 *
 * Non-registry: `canonicalPath === extensionSrcPath` = `<base>/.axm/extensions/external/<type>/<sanitized-name>`
 * Registry: `canonicalPath` = `<base>/.axm/extensions/<owner>/<type>/<sanitized-name>`,
 *           `extensionSrcPath` = `<canonicalPath>/src`
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly extensionSrcPath: AbsolutePath;
}

/**
 * Content filename for markdown-backed extension bodies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const extensionContentFilename = (name: string): string => `${name}.md`;

/**
 * Content path for markdown-backed extension bodies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const extensionContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => decodeAbsolutePathSync(join(root, extensionContentFilename(name)));

/**
 * Pure function to compute extension directory paths.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param source - Source type discriminant
 * @param type - Extension type plural directory segment
 * @param sanitizedName - Sanitized extension name for filesystem use
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeExtensionPaths = (
  join: (...paths: string[]) => string,
  base: string,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
  sanitizedName: string,
): ExtensionDirPaths => {
  if (source.refType === "registry" || source.refType === "workspace") {
    const canonicalPath = join(base, REGISTRY_EXTENSIONS_DIR, source.owner, type, sanitizedName);
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      extensionSrcPath: decodeAbsolutePathSync(join(canonicalPath, "src")),
    };
  }
  const canonicalPath = join(base, EXTERNAL_EXTENSIONS_DIR, type, sanitizedName);
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    extensionSrcPath: decodeAbsolutePathSync(canonicalPath),
  };
};
