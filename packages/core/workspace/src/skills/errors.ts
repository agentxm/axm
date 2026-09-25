/**
 * Typed failure family for the skill manager and materialization. Fields are
 * domain facts; the application error boundary owns rendering, codes, and
 * suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import type { AxmSkillIncompatible } from "@agentxm/cli-maintenance/official-skill/domain";

/**
 * A skill source or agent configuration did not validate. `detail` carries
 * the site's fact sentence verbatim.
 */
export class SkillDefinitionInvalid extends Data.TaggedError("SkillDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A skill artifact filesystem step failed; `detail` carries the site's fact sentence. */
export class SkillMaterializationFailed extends Data.TaggedError("SkillMaterializationFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Every failure the skill module constructs. */
export type SkillManagerError =
  | SkillDefinitionInvalid
  | SkillMaterializationFailed
  | AxmSkillCompatibilityUnavailable
  | AxmSkillIncompatible;
