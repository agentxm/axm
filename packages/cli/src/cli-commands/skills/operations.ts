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
import type { Source } from "../../sources/types.js";
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

export interface SkillRef {
  readonly skill: Skill;
  readonly path: Option<string>;
  readonly gitTreeSha: Option<string>;
  readonly registry: Option<{ scope: string; name: string } & ({ path: string } | { url: string })>;
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Args for the install-skill operation.
 */
export type AddSkillArgs = {
  readonly source: Source;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
} & SkillRef;

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddSkillOperation = Operation<"install-skill", AddSkillArgs>;

/**
 * Args for the uninstall-skill operation.
 */
export interface RemoveSkillArgs {
  readonly skillName: string;
}

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RemoveSkillOperation = Operation<"uninstall-skill", RemoveSkillArgs>;
