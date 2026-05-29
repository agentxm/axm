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
  DocsLockEntry,
  DocsResolvedInputsMap,
  DocsLockMap,
  Lockfile,
  MaterializedFileTarget,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RegistryPackLockEntryArgs,
  ResolvedExtensionMap,
  RegistryPackLockEntry,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "./schema.js";
export {
  CommandLockEntrySchema,
  CommandsLockMapSchema,
  DocsLockEntrySchema,
  DocsResolvedInputsMapSchema,
  DocsLockMapSchema,
  LOCKFILE_VERSION,
  makeRegistryPackLockEntry,
  LockfileSchema,
  MaterializedFileTargetSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryPackLockEntrySchema,
  ResolvedExtensionMapSchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
  SubagentLockEntrySchema,
  SubagentsLockMapSchema,
} from "./schema.js";

// Lockfile I/O and utilities
export { LOCKFILE_NAME } from "./lockfile.js";
export type { LockfileUpdate } from "./lockfile.js";

export { applyLockfileUpdates, commitLockfileUpdates, writeLockfile } from "./lockfile.js";
export { migrateLegacyUniversalSkillArtifacts } from "./migration.js";
export {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "./resolved-version.js";
