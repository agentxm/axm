/**
 * Lockfile feature module.
 *
 * Provides lockfile schema definitions and I/O functions for managing
 * the selected scope's `axm.lock` file that records accepted external
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
  LockfileToolTables,
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
  StoredLockfileDocument,
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
  LockfileToolTablesSchema,
  McpServerLockEntrySchema,
  McpServersLockMapSchema,
  PackLockEntrySchema,
  PacksLockMapSchema,
  RegistryPackLockEntrySchema,
  RuleLockEntrySchema,
  RulesLockMapSchema,
  SkillLockEntrySchema,
  SkillsLockMapSchema,
  StoredLockfileSchema,
  SubagentLockEntrySchema,
  SubagentsLockMapSchema,
} from "./schema.js";
export type {
  ProjectionDigest,
  ProjectionKind,
  ProjectionKindState,
  ProjectionRow,
  ProjectionRowChange,
  RecordedProjectionRow,
  Projections,
  ProjectionUnitPath,
} from "./projections.js";
export {
  PROJECTION_CONTRACTS,
  PROJECTION_KINDS,
  ProjectionDigestSchema,
  ProjectionKindStateSchema,
  ProjectionRowSchema,
  ProjectionsSchema,
  ProjectionUnitPathSchema,
  recordedProjectionRows,
  stageProjectionChanges,
} from "./projections.js";
export { emitLockfileToml } from "./toml.js";
export { parseLockfileToml } from "./toml-values.js";
export type { LockfileUpdate } from "./lockfile.js";

export {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileSnapshotUpdateAtPath,
  commitLockfileUpdates,
  readLockfileAtPath,
  writeLockfile,
  writeLockfileAtPath,
} from "./lockfile.js";
export {
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileWriteError,
} from "./errors.js";
export { validateExactResolvedVersion } from "./resolved-version.js";
export { acceptedRegistryVersionForRef } from "./accepted-registry-version.js";
