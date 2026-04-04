/**
 * Lockfile feature module.
 *
 * Provides lockfile schema definitions and I/O functions for managing
 * the `.axm/axm-lock.yaml` file that tracks installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
export type {
  BuiltinPackLockEntry,
  BuiltinPackLockEntryArgs,
  CommandLockEntry,
  CommandsLockMap,
  Lockfile,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RegistryPackLockEntryArgs,
  ResolvedExtensionMap,
  RegistryPackLockEntry,
  SkillLockEntry,
  SkillsLockMap,
} from "./schema.js";
export {
  BuiltinPackLockEntrySchema,
  CommandLockEntrySchema,
  CommandsLockMapSchema,
  DateFromString,
  makeBuiltinPackLockEntry,
  makeRegistryPackLockEntry,
  LockfileSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryPackLockEntrySchema,
  ResolvedExtensionMapSchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
} from "./schema.js";

// Lockfile I/O
export { LOCKFILE_NAME } from "./lockfile.js";

export { readLockfile, writeLockfile } from "./lockfile.js";
export {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "./resolved-version.js";
