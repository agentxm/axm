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

/** @experimental This API is unstable and may change without notice. */
export const MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

const HttpUrlSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(/^https?:\/\/[^\s]+$/, {
      message: "Expected an HTTP(S) URL.",
    }),
  ),
);

const Sha256Schema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[a-f0-9]{64}$/, {
      message: "Expected a lowercase SHA-256 hex digest.",
    }),
  ),
);

const McpRegistryInputFields = {
  choices: Schema.optional(Schema.Array(Schema.String)),
  default: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  format: Schema.optional(Schema.Literals(["string", "number", "boolean", "filepath"])),
  isRequired: Schema.optional(Schema.Boolean),
  isSecret: Schema.optional(Schema.Boolean),
  placeholder: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  variables: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
};

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryInputSchema = Schema.Struct({
  ...McpRegistryInputFields,
}).annotate({
  identifier: "McpRegistryInput",
  title: "MCP Registry Input",
  description: "Input metadata from the MCP registry server.json schema.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryInput = Schema.Schema.Type<typeof McpRegistryInputSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryKeyValueInputSchema = Schema.Struct({
  ...McpRegistryInputFields,
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "input name is required" })),
}).annotate({
  identifier: "McpRegistryKeyValueInput",
  title: "MCP Registry Key/Value Input",
  description: "Named header or environment variable input.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryKeyValueInput = Schema.Schema.Type<typeof McpRegistryKeyValueInputSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryNamedArgumentSchema = Schema.Struct({
  ...McpRegistryInputFields,
  type: Schema.Literal("named"),
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "argument name is required" })),
  isRepeated: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "McpRegistryNamedArgument",
  title: "MCP Registry Named Argument",
  description: "A named command-line argument.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryNamedArgument = Schema.Schema.Type<typeof McpRegistryNamedArgumentSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryPositionalArgumentSchema = Schema.Union([
  Schema.Struct({
    ...McpRegistryInputFields,
    type: Schema.Literal("positional"),
    isRepeated: Schema.optional(Schema.Boolean),
    valueHint: Schema.String.pipe(
      Schema.annotateKey({ messageMissingKey: "positional argument valueHint is required" }),
    ),
  }),
  Schema.Struct({
    ...McpRegistryInputFields,
    type: Schema.Literal("positional"),
    isRepeated: Schema.optional(Schema.Boolean),
    value: Schema.String.pipe(
      Schema.annotateKey({ messageMissingKey: "positional argument value is required" }),
    ),
  }),
]).annotate({
  identifier: "McpRegistryPositionalArgument",
  title: "MCP Registry Positional Argument",
  description: "A positional command-line argument.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryPositionalArgument = Schema.Schema.Type<
  typeof McpRegistryPositionalArgumentSchema
>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryArgumentSchema = Schema.Union([
  McpRegistryPositionalArgumentSchema,
  McpRegistryNamedArgumentSchema,
]).annotate({
  identifier: "McpRegistryArgument",
  title: "MCP Registry Argument",
  description: "Command-line argument metadata from the MCP registry schema.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryArgument = Schema.Schema.Type<typeof McpRegistryArgumentSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryIconSchema = Schema.Struct({
  src: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "icon src is required" }),
  ),
  mimeType: Schema.optional(
    Schema.Literals(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]),
  ),
  sizes: Schema.optional(
    Schema.Array(
      Schema.String.pipe(
        Schema.check(
          Schema.isPattern(/^(\d+x\d+|any)$/, {
            message: "Expected an icon size like 48x48 or any.",
          }),
        ),
      ),
    ),
  ),
  theme: Schema.optional(Schema.Literals(["light", "dark"])),
}).annotate({
  identifier: "McpRegistryIcon",
  title: "MCP Registry Icon",
  description: "Optional icon metadata from the MCP registry schema.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryIcon = Schema.Schema.Type<typeof McpRegistryIconSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryStdioTransportSchema = Schema.Struct({
  type: Schema.Literal("stdio"),
}).annotate({
  identifier: "McpRegistryStdioTransport",
  title: "MCP Registry Stdio Transport",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryStdioTransport = Schema.Schema.Type<typeof McpRegistryStdioTransportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryStreamableHttpTransportSchema = Schema.Struct({
  type: Schema.Literal("streamable-http"),
  url: HttpUrlSchema.pipe(Schema.annotateKey({ messageMissingKey: "transport url is required" })),
  headers: Schema.optional(Schema.Array(McpRegistryKeyValueInputSchema)),
}).annotate({
  identifier: "McpRegistryStreamableHttpTransport",
  title: "MCP Registry Streamable HTTP Transport",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryStreamableHttpTransport = Schema.Schema.Type<
  typeof McpRegistryStreamableHttpTransportSchema
>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistrySseTransportSchema = Schema.Struct({
  type: Schema.Literal("sse"),
  url: HttpUrlSchema.pipe(Schema.annotateKey({ messageMissingKey: "transport url is required" })),
  headers: Schema.optional(Schema.Array(McpRegistryKeyValueInputSchema)),
}).annotate({
  identifier: "McpRegistrySseTransport",
  title: "MCP Registry SSE Transport",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistrySseTransport = Schema.Schema.Type<typeof McpRegistrySseTransportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryLocalTransportSchema = Schema.Union([
  McpRegistryStdioTransportSchema,
  McpRegistryStreamableHttpTransportSchema,
  McpRegistrySseTransportSchema,
]).annotate({
  identifier: "McpRegistryLocalTransport",
  title: "MCP Registry Local Transport",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryLocalTransport = Schema.Schema.Type<typeof McpRegistryLocalTransportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryRemoteTransportSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("streamable-http"),
    url: HttpUrlSchema.pipe(Schema.annotateKey({ messageMissingKey: "transport url is required" })),
    headers: Schema.optional(Schema.Array(McpRegistryKeyValueInputSchema)),
    variables: Schema.optional(Schema.Record(Schema.String, McpRegistryInputSchema)),
  }),
  Schema.Struct({
    type: Schema.Literal("sse"),
    url: HttpUrlSchema.pipe(Schema.annotateKey({ messageMissingKey: "transport url is required" })),
    headers: Schema.optional(Schema.Array(McpRegistryKeyValueInputSchema)),
    variables: Schema.optional(Schema.Record(Schema.String, McpRegistryInputSchema)),
  }),
]).annotate({
  identifier: "McpRegistryRemoteTransport",
  title: "MCP Registry Remote Transport",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryRemoteTransport = Schema.Schema.Type<
  typeof McpRegistryRemoteTransportSchema
>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryPackageSchema = Schema.Struct({
  registryType: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "package registryType is required" }),
  ),
  identifier: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "package identifier is required" }),
  ),
  transport: McpRegistryLocalTransportSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "package transport is required" }),
  ),
  version: Schema.optional(
    Schema.NonEmptyString.pipe(
      Schema.check(
        Schema.makeFilter((value) =>
          value === "latest" ? "Package version must not be latest." : true,
        ),
      ),
    ),
  ),
  registryBaseUrl: Schema.optional(Schema.String),
  runtimeHint: Schema.optional(Schema.String),
  runtimeArguments: Schema.optional(Schema.Array(McpRegistryArgumentSchema)),
  packageArguments: Schema.optional(Schema.Array(McpRegistryArgumentSchema)),
  environmentVariables: Schema.optional(Schema.Array(McpRegistryKeyValueInputSchema)),
  fileSha256: Schema.optional(Sha256Schema),
}).annotate({
  identifier: "McpRegistryPackage",
  title: "MCP Registry Package",
  description: "Installable MCP server package distribution.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryPackage = Schema.Schema.Type<typeof McpRegistryPackageSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryRepositorySchema = Schema.Struct({
  url: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "repository url is required" })),
  source: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "repository source is required" }),
  ),
  id: Schema.optional(Schema.String),
  subfolder: Schema.optional(Schema.String),
}).annotate({
  identifier: "McpRegistryRepository",
  title: "MCP Registry Repository",
  description: "Repository metadata for an MCP server.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryRepository = Schema.Schema.Type<typeof McpRegistryRepositorySchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRegistryServerDetailSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  name: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP registry server name is required" }),
    Schema.check(
      Schema.isPattern(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/, {
        message: "Expected reverse-DNS MCP server name with one slash.",
      }),
    ),
  ),
  description: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP registry server description is required" }),
  ),
  version: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP registry server version is required" }),
  ),
  title: Schema.optional(Schema.NonEmptyString),
  packages: Schema.optional(Schema.Array(McpRegistryPackageSchema)),
  remotes: Schema.optional(Schema.Array(McpRegistryRemoteTransportSchema)),
  repository: Schema.optional(McpRegistryRepositorySchema),
  icons: Schema.optional(Schema.Array(McpRegistryIconSchema)),
  websiteUrl: Schema.optional(Schema.String),
  _meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({
  identifier: "McpRegistryServerDetail",
  title: "MCP Registry Server Detail",
  description:
    "Verbatim MCP registry server.json ServerDetail embedded in AXM mcp-server.json manifests.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRegistryServerDetail = Schema.Schema.Type<typeof McpRegistryServerDetailSchema>;

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
        "Short name for this MCP server within its owner namespace. Combined with owner, forms the FQN @owner/mcps/<name>.",
    }),
  ),
  server: McpRegistryServerDetailSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP registry server detail is required" }),
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
