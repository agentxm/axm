/**
 * Lockfile feature module.
 *
 * Provides lockfile schema definitions and I/O functions for managing
 * the selected scope's `axm-lock.yaml` file that records accepted external
 * extension resolutions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
export type {
  HookLockEntry,
  HooksLockMap,
  KnowledgeLockEntry,
  KnowledgeLockMap,
  Lockfile,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RegistryPackLockEntryArgs,
  RegistryPackLockEntry,
  RuleLockEntry,
  RulesLockMap,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "./schema.js";
export {
  HookLockEntrySchema,
  HooksLockMapSchema,
  KnowledgeLockEntrySchema,
  KnowledgeLockMapSchema,
  LOCKFILE_VERSION,
  makeRegistryPackLockEntry,
  LockfileSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryPackLockEntrySchema,
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
  commitLockfileSnapshotUpdateAtPath,
  commitLockfileUpdates,
  writeLockfile,
  writeLockfileAtPath,
} from "./lockfile.js";
export { validateExactResolvedVersion } from "./resolved-version.js";
export { acceptedRegistryVersionForRef } from "./accepted-registry-version.js";
