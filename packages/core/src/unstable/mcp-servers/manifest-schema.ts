/**
 * MCP server manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

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
  ...NonPackManifestFields,
  type: Schema.Literal("mcp-server"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP server name is required" }),
    Schema.annotate({
      description:
        "Short name for this MCP server within its owner namespace. Combined with owner, forms the FQN @owner/mcp-servers/<name>.",
    }),
  ),
}).annotate({
  identifier: "McpServerManifest",
  title: "MCP Server Manifest",
  description:
    "Extension manifest file for MCP server. Registers a Model Context Protocol server that coding agents can connect to for additional tools and resources.",
});

/**
 * Inferred type for McpServerManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerManifest = Schema.Schema.Type<typeof McpServerManifestSchema>;
