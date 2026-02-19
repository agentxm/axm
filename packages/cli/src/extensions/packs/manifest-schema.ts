/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CommonManifestFields, FQN_PATTERN } from "../common.js";

/**
 * Version specifier map: FQN keys to semver range values.
 * Used for skills, commands, and mcp-servers in pack manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */
const VersionSpecifierMapSchema = Schema.Record({
  key: Schema.String,
  value: Schema.String,
}).pipe(
  Schema.filter((record) => {
    const invalidKeys = Object.keys(record).filter((key) => !FQN_PATTERN.test(key));
    if (invalidKeys.length > 0) {
      return `Invalid fully qualified name(s): ${invalidKeys.join(", ")}. Names must match @scope/type/name format (e.g. @scope/skills/my-skill).`;
    }
    return undefined;
  }),
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
  skills: Schema.optional(VersionSpecifierMapSchema),
  commands: Schema.optional(VersionSpecifierMapSchema),
  "mcp-servers": Schema.optional(VersionSpecifierMapSchema),
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = typeof PackManifestSchema.Type;
