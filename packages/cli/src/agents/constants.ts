/**
 * Shared path constants for agent configuration directories.
 *
 * Pre-expanded paths at module initialization eliminate the need for
 * tilde expansion at runtime. All paths are absolute.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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

/**
 * Claude configuration directory.
 *
 * Uses `CLAUDE_CONFIG_DIR` environment variable if set, otherwise defaults to `~/.claude`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const claudeHome = process.env["CLAUDE_CONFIG_DIR"] ?? path.join(home, ".claude");

/**
 * Codex configuration directory.
 *
 * Uses `CODEX_HOME` environment variable if set, otherwise defaults to `~/.codex`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const codexHome = process.env["CODEX_HOME"] ?? path.join(home, ".codex");
