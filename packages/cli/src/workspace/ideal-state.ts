/**
 * Ideal state builders for skills reconciliation.
 *
 * Computes the desired state for skills operations based on current state
 * and command parameters. Part of the desired-state reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillRef } from "../cli-commands/skills/install/discover-skills.js";
import type { Source } from "../sources/types.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddSkillOperation = {
  readonly _tag: "add-skill";
  readonly source: Source;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
} & SkillRef;

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RemoveSkillOperation {
  readonly _tag: "remove-skill";
  readonly name: string;
}

/**
 * A workspace operation that transforms the ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceOperation = AddSkillOperation | RemoveSkillOperation;
