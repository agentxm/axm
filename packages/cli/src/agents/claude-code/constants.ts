/**
 * Path constants for Claude Code agent.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import { home } from "../constants.js";

/**
 * Claude configuration directory.
 *
 * Uses `CLAUDE_CONFIG_DIR` environment variable if set, otherwise defaults to `~/.claude`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const claudeHome = process.env["CLAUDE_CONFIG_DIR"] ?? path.join(home, ".claude");
