/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:url fileURLToPath has no @effect/platform equivalent.
// This is a pure string transform (no I/O) so wrapping in Effect adds no value.
import { fileURLToPath as nodeFileUrlToPath } from "node:url";

/** Convert a `file://` URL to a local filesystem path. */
export const fileUrlToPath = (fileUrl: string): string => nodeFileUrlToPath(fileUrl);
