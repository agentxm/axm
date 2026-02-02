/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { CommonManifestFields, FullyQualifiedName } from "./common";

/**
 * Schema for pack manifest files (axm-pack.json).
 *
 * Packs bundle multiple extensions (skills, commands, MCP servers,
 * and other packs) for convenient distribution and installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackManifest = Schema.Struct({
  ...CommonManifestFields,
  skills: Schema.optional(Schema.Array(FullyQualifiedName)),
  commands: Schema.optional(Schema.Array(FullyQualifiedName)),
  "mcp-servers": Schema.optional(Schema.Array(FullyQualifiedName)),
  packs: Schema.optional(Schema.Array(FullyQualifiedName)),
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = typeof PackManifest.Type;
