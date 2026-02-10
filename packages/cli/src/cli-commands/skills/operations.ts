/**
 * Skill operation types and references.
 *
 * Shared across skill operations (install, uninstall, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Option } from "effect/Option";
import type { ReadonlyRecord } from "effect/Record";
import type { SourceInput } from "../../sources/types.js";
import type { Operation } from "../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Base skill metadata parsed from SKILL.md frontmatter.
 */
export interface Skill {
  /** Unique name of the skill */
  readonly name: string;
  /** Description of the skill */
  readonly description: string;
  /** Optional metadata from SKILL.md frontmatter */
  readonly metadata: Option<ReadonlyRecord<string, unknown>>;
}

export type { SkillRef } from "../../sources/provider.js";

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Args for the install-skill operation.
 */
export type AddSkillArgs = {
  readonly source: SourceInput;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
  readonly skill: Skill;
  readonly location: string;
  readonly version: Option<string>;
  readonly gitTreeSha: Option<string>;
};

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddSkillOperation = Operation<"install-skill", AddSkillArgs>;

/**
 * Args for the uninstall-skill operation.
 */
export interface UninstallSkillArgs {
  readonly skillName: string;
  /** Agent filter for partial uninstall. Empty = all agents. */
  readonly agents: ReadonlyArray<string>;
}

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallSkillOperation = Operation<"uninstall-skill", UninstallSkillArgs>;

/**
 * Args for the fork-skill operation.
 *
 * Copies source files to `.axm/extensions/@<scope>/skills/<name>/`
 * and generates an `axm-skill.json` manifest.
 */
export type ForkSkillArgs = {
  /** Where to fork from (the source skill's files). */
  readonly source: SourceInput;
  /** Target identity in `@scope/name` format. */
  readonly targetName: string;
  /** Agent compatibility list for the generated manifest. */
  readonly agents: ReadonlyArray<string>;
  /** Location of the source skill files (file:// URL). */
  readonly location: string;
};

/**
 * Fork a skill into a managed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ForkSkillOperation = Operation<"fork-skill", ForkSkillArgs>;

/**
 * Args for the publish-skill operation.
 *
 * Reads the manifest from `.axm/extensions/`, builds a zip archive,
 * computes the SHA-256 checksum, and publishes to the target registry.
 */
export type PublishSkillArgs = {
  /** Extension identity in `@scope/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g. "local"). */
  readonly registryName: string;
};

/**
 * Publish a managed extension to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishSkillOperation = Operation<"publish-skill", PublishSkillArgs>;
