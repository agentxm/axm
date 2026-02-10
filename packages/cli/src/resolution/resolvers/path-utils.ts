/**
 * Shared path utilities for resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";

/**
 * Expand `~` or `~/...` to the user's home directory.
 *
 * Handles both bare `~` and `~/path` (or `~\path` on Windows).
 */
export const expandHome = (p: string): string => {
  if (p === "~") {
    return os.homedir();
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return nodePath.join(os.homedir(), p.slice(2));
  }
  return p;
};
