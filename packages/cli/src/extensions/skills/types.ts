/**
 * Core domain types for skills management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Record from "effect/Record";

// Re-export Source types from canonical location
export type { GitHostingProviderSource, Source, SourceType } from "../../sources/index.js";
export { isGitHostingProviderSource } from "../../sources/index.js";

// -----------------------------------------------------------------------------
// Skill Types
// -----------------------------------------------------------------------------

/**
 * Represents a discovered skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Skill {
  /** Unique name of the skill */
  readonly name: string;
  /** Description of the skill */
  readonly description: string;
  /** Optional metadata from SKILL.md frontmatter */
  readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
}

// -----------------------------------------------------------------------------
// Lockfile Types
// -----------------------------------------------------------------------------

/**
 * Per-skill entry in the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockEntry {
  /** Canonical source notation (e.g., "github:owner/repo") */
  readonly source: string;
  /** Fully resolved URL or path */
  readonly origin: string;
  /** Git tree SHA for git sources, or SHA-256 content hash for local sources */
  readonly folderHash: string;
  /** ISO 8601 timestamp of initial installation */
  readonly installedAt: string;
  /** ISO 8601 timestamp of last update */
  readonly updatedAt: string;
}

/**
 * Extensions section in lockfile containing locked extension entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockfileExtensions {
  /** Skills keyed by name */
  readonly skills: Readonly<Record.ReadonlyRecord<string, LockEntry>>;
}

/**
 * Contents of .axm/axm.lock (JSON format).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Lockfile {
  /** Lockfile schema version */
  readonly lockfileVersion: number;
  /** Locked extensions keyed by type */
  readonly extensions: LockfileExtensions;
}

// -----------------------------------------------------------------------------
// Re-exports from canonical schemas
// -----------------------------------------------------------------------------

export type { Settings } from "../../settings/index.js";
