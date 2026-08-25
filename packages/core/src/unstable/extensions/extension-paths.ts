/**
 * Shared extension directory path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Handle } from "./handle.js";
import type { ExtensionTypePlural } from "./common.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceLayout } from "../workspace/layout.js";

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
  | { readonly refType: "git-hosted" | "local"; readonly owner: Handle };

/**
 * Computed paths for an installed extension directory.
 *
 * - `canonicalPath`: root of the installed extension
 * - `extensionSrcPath`: where actual extension source files live
 *
 * Package-backed extension types keep authored content in `<canonicalPath>/src`.
 * MCP servers and packs use their package root because their manifests are the
 * complete executable declaration.
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
  if (source.refType === "workspace") {
    const canonicalPath = join(base, type, sanitizedName);
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      extensionSrcPath: decodeAbsolutePathSync(join(canonicalPath, "src")),
    };
  }
  if (source.refType === "registry") {
    const canonicalPath = join(base, ".axm", "extensions", source.owner, type, sanitizedName);
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      extensionSrcPath: decodeAbsolutePathSync(join(canonicalPath, "src")),
    };
  }
  const canonicalPath = join(base, ".axm", "extensions", "external", type, sanitizedName);
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    extensionSrcPath: decodeAbsolutePathSync(canonicalPath),
  };
};

/** Resolve canonical package paths from the explicit scope-aware workspace layout. */
export const computeExtensionPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
  sanitizedName: string,
): ExtensionDirPaths => {
  if (layout.scope === "user") {
    const canonicalPath =
      source.refType === "registry" || source.refType === "workspace"
        ? join(layout.canonicalRoot, source.owner, type, sanitizedName)
        : join(layout.canonicalRoot, "external", type, sanitizedName);
    return {
      canonicalPath: decodeAbsolutePathSync(canonicalPath),
      extensionSrcPath: decodeAbsolutePathSync(
        source.refType === "registry" || source.refType === "workspace"
          ? join(canonicalPath, "src")
          : canonicalPath,
      ),
    };
  }

  const canonicalPath =
    source.refType === "workspace"
      ? join(
          layout.authoredRoot(
            type === "mcps"
              ? "mcp-server"
              : type === "skills"
                ? "skill"
                : type === "subagents"
                  ? "subagent"
                  : type === "rules"
                    ? "rule"
                    : type === "hooks"
                      ? "hook"
                      : type === "knowledge"
                        ? "knowledge"
                        : "pack",
          ),
          sanitizedName,
        )
      : join(layout.acquiredRoot, source.owner, type, sanitizedName);
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    extensionSrcPath: decodeAbsolutePathSync(
      type === "mcps" || type === "packs" ? canonicalPath : join(canonicalPath, "src"),
    ),
  };
};
