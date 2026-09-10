/**
 * Pure filesystem path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { fileURLToPath } from "node:url";

/** Convert a file URL to the current platform's native path representation. */
export const stripFileProtocol = (location: string): string =>
  location.startsWith("file:") ? fileURLToPath(location) : location;
