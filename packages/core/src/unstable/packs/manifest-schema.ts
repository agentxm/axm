/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields, FQN_PATTERN } from "../extensions/common.js";

export const PACK_MANIFEST_FILENAME = "axm-pack.json";

/**
 * Raw pack manifest JSON shape (no schema validation on read to allow editing).
 */
export interface RawPackManifest {
  profile: string;
  type: string;
  name: string;
  version: string;
  skills?: Record<string, string>;
  commands?: Record<string, string>;
  "mcp-servers"?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Loose structural validation for raw pack manifests.
 * Validates basic shape (name, version, optional string maps) without FQN enforcement.
 * Used for read-then-edit workflows where the full PackManifestSchema is too strict.
 */
export const RawPackManifestSchema = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  skills: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  commands: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "mcp-servers": Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

/**
 * Version specifier map: FQN keys to semver range values.
 * Used for skills, commands, and mcp-servers in pack manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */
const VersionSpecifierMapSchema = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.check(
    Schema.makeFilter<Record<string, string>>((record) => {
      const invalidKeys = Object.keys(record).filter((key) => !FQN_PATTERN.test(key));
      if (invalidKeys.length > 0) {
        return `Invalid fully qualified name(s): ${invalidKeys.join(", ")}. Names must match @handle/type/name format (e.g. @acme/skills/my-skill).`;
      }
      return undefined;
    }),
  ),
);

/**
 * Schema for pack manifest files (axm-pack.json).
 *
 * Packs bundle multiple extensions (skills, commands, MCP servers)
 * for convenient distribution and installation. Each extension entry
 * maps a fully qualified name to a semver version range.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackManifestSchema = Schema.Struct({
  ...CommonManifestFields,
  type: Schema.Literal("pack"),
  skills: Schema.optional(VersionSpecifierMapSchema),
  commands: Schema.optional(VersionSpecifierMapSchema),
  "mcp-servers": Schema.optional(VersionSpecifierMapSchema),
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
