/**
 * Core domain types for skills management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Record from "effect/Record";

import type { Source as BaseSource } from "../sources.js";

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
  /** Optional description of the skill */
  readonly description: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Source Parsing Types
// -----------------------------------------------------------------------------

/**
 * Source type discriminator for ParsedSource.
 *
 * Extends base Source with `"wellknown"` for HTTP(S) URLs with well-known skills index.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Source = BaseSource | "wellknown";

/**
 * Result of parsing a source string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ParsedSource {
  /** Type of the source */
  readonly type: Source;
  /** Original input string */
  readonly original: string;
  /** Normalized canonical form (e.g., "github:owner/repo") */
  readonly canonical: string;
  /** Repository owner (for github/gitlab/bitbucket) */
  readonly owner: Option.Option<string>;
  /** Repository name (for github/gitlab/bitbucket) */
  readonly repo: Option.Option<string>;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
  /** URL (for git sources) */
  readonly url: Option.Option<string>;
  /** Absolute path for local sources (after ~ expansion) */
  readonly localPath: Option.Option<string>;
  /** Base URL for wellknown sources */
  readonly baseUrl: Option.Option<string>;
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
// Well-Known Discovery Types
// -----------------------------------------------------------------------------

/**
 * Entry in a well-known skills index.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WellKnownSkill {
  /** Unique name of the skill */
  readonly name: string;
  /** Description of what the skill does */
  readonly description: string;
  /** List of files in the skill (e.g., ["SKILL.md", "references/commands.md"]) */
  readonly files: readonly string[];
}

/**
 * Index from /.well-known/skills/index.json.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WellKnownIndex {
  /** Available skills */
  readonly skills: readonly WellKnownSkill[];
}

// -----------------------------------------------------------------------------
// Re-exports from canonical schemas
// -----------------------------------------------------------------------------

export type { Settings } from "../../settings/index.js";
