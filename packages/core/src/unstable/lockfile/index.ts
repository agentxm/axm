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
  FilesLockEntry,
  FilesResolvedInputsMap,
  FilesLockMap,
  HookLockEntry,
  HooksLockMap,
  KnowledgeLockEntry,
  KnowledgeLockMap,
  Lockfile,
  MaterializedFileTarget,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RegistryPackLockEntryArgs,
  ResolvedExtension,
  ResolvedExtensionMap,
  RegistryPackLockEntry,
  WorkspacePackLockEntry,
  RuleLockEntry,
  RulesLockMap,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "./schema.js";
export {
  CommandLockEntrySchema,
  CommandsLockMapSchema,
  FilesLockEntrySchema,
  FilesResolvedInputsMapSchema,
  FilesLockMapSchema,
  HookLockEntrySchema,
  HooksLockMapSchema,
  KnowledgeLockEntrySchema,
  KnowledgeLockMapSchema,
  LOCKFILE_VERSION,
  makeRegistryPackLockEntry,
  LockfileSchema,
  MaterializedFileTargetSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryPackLockEntrySchema,
  WorkspacePackLockEntrySchema,
  ResolvedExtensionMapSchema,
  RuleLockEntrySchema,
  RulesLockMapSchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
  SubagentLockEntrySchema,
  SubagentsLockMapSchema,
} from "./schema.js";

// Lockfile I/O and utilities
export { LOCKFILE_NAME } from "./lockfile.js";
export type { LockfileUpdate } from "./lockfile.js";

export {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileUpdates,
  writeLockfile,
} from "./lockfile.js";
export {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "./resolved-version.js";
