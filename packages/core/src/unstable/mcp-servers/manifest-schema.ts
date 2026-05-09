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
  $schema: Schema.optional(
    Schema.String.annotate({
      description:
        "JSON Schema URL used by editors for validation and completions. Typically set automatically by axm.",
    }),
  ),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("mcp-server").annotate({
    description: "Discriminator for the manifest kind. Always 'mcp-server' for mcp-server.json.",
  }),
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
    "MCP server extension manifest (mcp-server.json). Registers a Model Context Protocol server that coding agents can connect to for additional tools and resources.",
});

/**
 * Inferred type for McpServerManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerManifest = Schema.Schema.Type<typeof McpServerManifestSchema>;
