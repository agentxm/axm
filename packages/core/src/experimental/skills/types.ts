/**
 * Core domain types for skills management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
  readonly description?: string;
}

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

/**
 * Agent configuration for detection.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentConfig {
  /** Unique identifier (e.g., "claude-code", "cursor") */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;
  /** Path to check for agent detection (e.g., "~/.claude") */
  readonly detectPath: string;
  /** Directory where agent loads skills from */
  readonly skillsDir?: string;
}

// -----------------------------------------------------------------------------
// Source Parsing Types
// -----------------------------------------------------------------------------

/**
 * Source type discriminator for ParsedSource.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = "github" | "gitlab" | "local" | "direct-url" | "well-known";

/**
 * Result of parsing a source string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ParsedSource {
  /** Type of the source */
  readonly type: SourceType;
  /** Original input string */
  readonly original: string;
  /** Normalized canonical form (e.g., "github:owner/repo") */
  readonly canonical: string;
  /** Repository owner (for github/gitlab) */
  readonly owner?: string;
  /** Repository name (for github/gitlab) */
  readonly repo?: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref?: string;
  /** Subpath within the repository */
  readonly path?: string;
  /** URL (for direct-url/well-known) */
  readonly url?: string;
}

// -----------------------------------------------------------------------------
// Settings Types
// -----------------------------------------------------------------------------

/**
 * Extensions section containing installed extension references.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SettingsExtensions {
  /** Skills keyed by name with version specifier (e.g., "^1.0.0" or "*" for unversioned) */
  readonly skills: Readonly<Record<string, string>>;
}

/**
 * Contents of .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Settings {
  /** Default scope for skill resolution (defaults to "@community" if not specified) */
  readonly scope?: string;
  /** Default agent IDs */
  readonly agents: readonly string[];
  /** Installed extensions keyed by type */
  readonly extensions: SettingsExtensions;
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
  readonly skills: Readonly<Record<string, LockEntry>>;
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
