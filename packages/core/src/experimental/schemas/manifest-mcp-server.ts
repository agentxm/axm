/**
 * MCP server manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields } from "./common";

/**
 * Schema for MCP server manifest files (axm-mcp-server.json).
 *
 * MCP servers provide Model Context Protocol endpoints that
 * extend coding agent capabilities with external tools and resources.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerManifestSchema = Schema.Struct({
  ...CommonManifestFields,
});

/**
 * Inferred type for McpServerManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerManifest = typeof McpServerManifestSchema.Type;
