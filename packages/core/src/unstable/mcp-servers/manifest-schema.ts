/**
 * MCP server manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields } from "../extensions/common.js";

/**
 * Filename for MCP server manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MCP_SERVER_MANIFEST_FILENAME = "axm-mcp-server.json";

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
  type: Schema.Literal("mcp-server"),
});

/**
 * Inferred type for McpServerManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerManifest = Schema.Schema.Type<typeof McpServerManifestSchema>;
