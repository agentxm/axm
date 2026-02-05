/**
 * Types for well-known skills discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
