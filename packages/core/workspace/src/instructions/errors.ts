/**
 * Typed failure family for the rule manager. Fields are domain facts; the
 * application error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * A rule package's source, manifest, or body did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class RuleDefinitionInvalid extends Data.TaggedError("RuleDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Every failure the rule manager constructs. */
export type RuleManagerError = RuleDefinitionInvalid;
