/**
 * Shared constants and types for pack operations.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const PACK_MANIFEST_FILENAME = "axm-pack.json";

/**
 * Raw pack manifest JSON shape (no schema validation on read to allow editing).
 */
export interface RawPackManifest {
  name: string;
  version: string;
  skills?: Record<string, string>;
  commands?: Record<string, string>;
  "mcp-servers"?: Record<string, string>;
  [key: string]: unknown;
}
