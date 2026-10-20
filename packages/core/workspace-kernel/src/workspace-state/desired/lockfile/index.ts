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
  Lockfile,
  McpServerLockEntry,
  PackLockEntry,
  RegistryPackLockEntry,
  RuleLockEntry,
  RulesLockMap,
  SkillLockEntry,
  SubagentLockEntry,
} from "./schema.js";
export {
  HooksLockMapSchema,
  LOCKFILE_VERSION,
  makeRegistryPackLockEntry,
  LockfileSchema,
  McpServerLockEntrySchema,
  PackLockEntrySchema,
  RulesLockMapSchema,
  SkillLockEntrySchema,
  StoredLockfileSchema,
} from "./schema.js";
export type {
  ProjectionDigest,
  ProjectionKind,
  ProjectionRowChange,
  RecordedProjectionRow,
  Projections,
  ProjectionUnitPath,
} from "./projections.js";
export {
  PROJECTION_KINDS,
  ProjectionDigestSchema,
  ProjectionUnitPathSchema,
  recordedProjectionRows,
  stageProjectionChanges,
} from "./projections.js";
export { emitLockfileToml } from "./toml.js";
export { parseLockfileToml } from "./toml-values.js";
export {
  commitLockfileSnapshotUpdateAtPath,
  commitLockfileUpdates,
  readLockfileAtPath,
  writeLockfileAtPath,
} from "./lockfile.js";
export {
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileWriteError,
} from "./errors.js";
export { validateExactResolvedVersion } from "./resolved-version.js";
export { acceptedRegistryVersionForRef } from "./accepted-registry-version.js";
