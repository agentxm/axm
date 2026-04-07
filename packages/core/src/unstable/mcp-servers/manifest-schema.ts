/**
 * MCP server manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestBaseFields, ExtensionNameSchema } from "../extensions/common.js";

/**
 * Filename for MCP server manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MCP_SERVER_MANIFEST_FILENAME = "mcp-server.json";

/**
 * URL for the MCP server manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MCP_SERVER_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/mcp-server.schema.json";

/**
 * Schema for MCP server manifest files (mcp-server.json).
 *
 * MCP servers provide Model Context Protocol endpoints that
 * extend coding agent capabilities with external tools and resources.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  type: Schema.Literal("mcp-server"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP server name is required" }),
  ),
}).annotate({
  identifier: "McpServerManifest",
  title: "MCP Server Manifest",
  description: "Configuration file (mcp-server.json) that defines an MCP server extension.",
});

/**
 * Inferred type for McpServerManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerManifest = Schema.Schema.Type<typeof McpServerManifestSchema>;
