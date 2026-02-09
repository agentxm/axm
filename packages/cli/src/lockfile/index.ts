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
export type { Lockfile, SkillLockEntry, SkillsLockMap } from "./schema.js";
export {
  AzureReposLockEntrySchema,
  BitbucketLockEntrySchema,
  DateFromString,
  GitHubLockEntrySchema,
  GitLabLockEntrySchema,
  GitLockEntrySchema,
  LocalLockEntrySchema,
  LockfileSchema,
  RegistryLockEntrySchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
} from "./schema.js";

// Lockfile I/O
export type { LockfileError } from "./lockfile.js";
export {
  LOCKFILE_NAME,
  LockfileNotFoundError,
  LockfileParseError,
  LockfileWriteError,
} from "./lockfile.js";

/** @internal Bootstrap use only — prefer LockfileService for normal callers. */
export { writeLockfile } from "./lockfile.js";

// Lockfile service
export { LockfileService, LockfileServiceLive } from "./service.js";
