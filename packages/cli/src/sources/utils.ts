/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { fileURLToPath as nodeFileUrlToPath } from "node:url";

/** Convert a `file://` URL to a local filesystem path. */
export const fileUrlToPath = (fileUrl: string): string => nodeFileUrlToPath(fileUrl);
