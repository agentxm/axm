/**
 * Path constants for Codex agent.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import { home } from "../constants.js";

/**
 * Codex configuration directory.
 *
 * Uses `CODEX_HOME` environment variable if set, otherwise defaults to `~/.codex`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const codexHome = process.env["CODEX_HOME"] ?? path.join(home, ".codex");
