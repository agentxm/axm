/**
 * Lockfile schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { FullyQualifiedName } from "./common";

/**
 * Lock entry for a single installed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockEntry = Schema.Struct({
  source: Schema.String,
  origin: Schema.String,
  path: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  folderHash: Schema.String,
  dependencies: Schema.optional(Schema.Array(FullyQualifiedName)),
  installedAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * Inferred type for LockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockEntry = typeof LockEntry.Type;

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
export const ExtensionLockMap = Schema.Record({
  key: Schema.String,
  value: LockEntry,
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
export type ExtensionLockMap = typeof ExtensionLockMap.Type;

/**
 * Extensions grouped by type in the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionsByType = Schema.Struct({
  skills: Schema.optional(ExtensionLockMap),
  commands: Schema.optional(ExtensionLockMap),
  packs: Schema.optional(ExtensionLockMap),
  "mcp-servers": Schema.optional(ExtensionLockMap),
});

/**
 * Inferred type for ExtensionsByType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionsByType = typeof ExtensionsByType.Type;

/**
 * Schema for lockfile (axm-lock.yaml).
 *
 * The lockfile records the exact resolved state of all installed extensions,
 * enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const Lockfile = Schema.Struct({
  lockfileVersion: Schema.Number,
  extensions: ExtensionsByType,
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = typeof Lockfile.Type;
