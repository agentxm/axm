/**
 * Lockfile feature module.
 *
 * Provides lockfile schema definitions and I/O functions for managing
 * the `.axm/axm-lock.yaml` file that tracks installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export everything from core
export type {
  CommandLockEntry,
  CommandsLockMap,
  Lockfile,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RegistryPackLockEntry,
  SkillLockEntry,
  SkillsLockMap,
} from "@axm.sh/core/unstable/lockfile";
export {
  BuiltinPackLockEntrySchema,
  CommandLockEntrySchema,
  CommandsLockMapSchema,
  DateFromString,
  LOCKFILE_NAME,
  LockfileSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  readLockfile,
  RegistryPackLockEntrySchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
  writeLockfile,
} from "@axm.sh/core/unstable/lockfile";
