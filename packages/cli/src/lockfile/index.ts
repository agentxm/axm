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
} from "./schema.js";
export {
  AzureReposLockEntrySchema,
  BitbucketLockEntrySchema,
  BuiltinPackLockEntrySchema,
  BuiltinSkillLockEntrySchema,
  CommandLockEntrySchema,
  CommandsLockMapSchema,
  DateFromString,
  GitHubLockEntrySchema,
  GitLabLockEntrySchema,
  GitLockEntrySchema,
  LocalLockEntrySchema,
  LockfileSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryLockEntrySchema,
  RegistryPackLockEntrySchema,
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
