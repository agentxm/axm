/**
 * Typed failure family for the subagent manager. Fields are domain facts; the
 * application error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * A subagent package, source, or binding did not validate. `detail` carries
 * the site's fact sentence verbatim.
 */
export class SubagentDefinitionInvalid extends Data.TaggedError("SubagentDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** The canonical subagent content file could not be read. */
export class SubagentContentUnreadable extends Data.TaggedError("SubagentContentUnreadable")<{
  readonly expectedFilename: string;
  readonly subagentSrcPath: string;
  readonly contentPath: string;
  readonly cause: unknown;
}> {}

/** A subagent filesystem step failed; `detail` carries the site's fact sentence. */
export class SubagentIoFailed extends Data.TaggedError("SubagentIoFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class SubagentInstallStateMissing extends Data.TaggedError("SubagentInstallStateMissing")<{
  readonly name: string;
  readonly kind: "content-identity" | "external-resolution";
}> {}

/** Every failure the subagent manager constructs. */
export type SubagentManagerError =
  | SubagentDefinitionInvalid
  | SubagentContentUnreadable
  | SubagentIoFailed
  | SubagentInstallStateMissing;
