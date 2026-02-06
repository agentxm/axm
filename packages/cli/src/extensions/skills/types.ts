/**
 * Core domain types for skills management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import type { ExtensionRef } from "../common.js";

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
  /** Path to SKILL.md file */
  readonly path: string;
  /** Description of the skill */
  readonly description: string;
  /** Optional metadata from SKILL.md frontmatter */
  readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
}

/**
 * A skill augmented with its discovery path metadata.
 *
 * The `discoveryPath` is a non-empty array of `ExtensionRef` entries.
 * The last element is always the skill itself; preceding elements are
 * packs through which the skill was discovered.
 *
 * Note: `workspace/ideal-state.ts` also defines a `DiscoveredSkill`
 * (version/hash metadata for reconciliation). Different concept, different module.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DiscoveredSkill extends Skill {
  readonly discoveryPath: Array.NonEmptyReadonlyArray<ExtensionRef>;
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
