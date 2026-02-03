/**
 * Lockfile schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { FullyQualifiedNameSchema } from "./common";

/**
 * Lock entry for a single installed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockEntrySchema = Schema.Struct({
  source: Schema.String,
  origin: Schema.String,
  path: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  folderHash: Schema.String,
  dependencies: Schema.optional(Schema.Array(FullyQualifiedNameSchema)),
  installedAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * Inferred type for LockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockEntry = typeof LockEntrySchema.Type;

/**
 * Pattern for validating fully qualified extension names.
 */
const FQN_PATTERN = /^@[\w-]+\/[\w-]+$/;

/**
 * Map of fully qualified extension names to their lock entries.
 * Validates that all keys match the @scope/name pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionLockMapSchema = Schema.Record({
  key: Schema.String,
  value: LockEntrySchema,
}).pipe(
  Schema.filter((record) => {
    const invalidKeys = Object.keys(record).filter((key) => !FQN_PATTERN.test(key));
    if (invalidKeys.length > 0) {
      return `Invalid extension name(s): ${invalidKeys.join(", ")}. Names must match @<scope>/<name> pattern.`;
    }
    return undefined;
  }),
);

/**
 * Inferred type for ExtensionLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionLockMap = typeof ExtensionLockMapSchema.Type;

/**
 * Extensions grouped by type in the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionsByTypeSchema = Schema.Struct({
  skills: Schema.optional(ExtensionLockMapSchema),
  commands: Schema.optional(ExtensionLockMapSchema),
  packs: Schema.optional(ExtensionLockMapSchema),
  "mcp-servers": Schema.optional(ExtensionLockMapSchema),
});

/**
 * Inferred type for ExtensionsByType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionsByType = typeof ExtensionsByTypeSchema.Type;

/**
 * Schema for lockfile (axm-lock.yaml).
 *
 * The lockfile records the exact resolved state of all installed extensions,
 * enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileSchema = Schema.Struct({
  lockfileVersion: Schema.Number,
  extensions: ExtensionsByTypeSchema,
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = typeof LockfileSchema.Type;
