/**
 * Centralized command path computation.
 *
 * Mirrors `subagents/paths.ts`. The canonical content file for a command is
 * `${name}.md` (e.g., `review-pr.md`), placed inside the command's source
 * directory.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { computeExtensionPaths, type ExtensionPathSource } from "../extensions/index.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";

/**
 * Minimal structural discriminant for determining command path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed command directory.
 *
 * - `canonicalPath`: root of the installed command
 * - `commandSrcPath`: where actual command source files live
 *
 * Non-registry: `canonicalPath === commandSrcPath` = `<base>/.axm/extensions/external/commands/<sanitized-name>`
 * Registry: `canonicalPath` = `<base>/.axm/extensions/<owner>/commands/<sanitized-name>`,
 *           `commandSrcPath` = `<canonicalPath>/src`
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CommandDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly commandSrcPath: AbsolutePath;
}

/**
 * Content filename for a command's prompt body.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commandContentFilename = (name: string): string => `${name}.md`;

/**
 * Content path for a command's prompt body.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commandContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => decodeAbsolutePathSync(join(root, commandContentFilename(name)));

/**
 * Pure function to compute command directory paths.
 *
 * @param join - Path join function (e.g., `path.join`)
 * @param base - Workspace root (parent of `.axm`)
 * @param source - Source type discriminant
 * @param sanitizedName - Sanitized command name for filesystem use
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeCommandPaths = (
  join: (...paths: string[]) => string,
  base: string,
  source: CommandPathSource,
  sanitizedName: string,
): CommandDirPaths => {
  const paths = computeExtensionPaths(join, base, "commands", source, sanitizedName);
  return {
    canonicalPath: paths.canonicalPath,
    commandSrcPath: paths.sourcePath,
  };
};
