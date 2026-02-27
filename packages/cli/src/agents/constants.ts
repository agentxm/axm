/**
 * Shared path constants for agent configuration directories.
 *
 * Pre-expanded paths at module initialization eliminate the need for
 * tilde expansion at runtime. All paths are absolute.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// TODO: (#20) node:os and node:path are convention violations (CLAUDE.md requires @effect/platform).
// These are used for eager module-level initialization. Migrating requires making this module
// effectful, which cascades to all consumers. Out of scope for this sweep.
import * as os from "node:os";
import * as path from "node:path";

/**
 * User's home directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const home = os.homedir();

/**
 * XDG config home directory.
 *
 * Uses `XDG_CONFIG_HOME` environment variable if set, otherwise defaults to `~/.config`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const configHome = process.env["XDG_CONFIG_HOME"] ?? path.join(home, ".config");
