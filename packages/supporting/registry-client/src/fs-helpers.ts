/**
 * Pure filesystem path helpers.
 *
 * Deliberately duplicated from the CLI-destined fs-helpers module: the
 * integration may not depend on application utilities, and this helper is
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { fileURLToPath } from "node:url";

/** Convert a file URL to the current platform's native path representation. */
export const stripFileProtocol = (location: string): string =>
  location.startsWith("file:") ? fileURLToPath(location) : location;
