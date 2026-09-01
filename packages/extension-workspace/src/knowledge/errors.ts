/**
 * Typed failure family for the Knowledge manager, discovery, and package
 * inspection. Fields are domain facts; the application error boundary owns
 * rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * A Knowledge bundle source, manifest, or discovery input did not validate.
 * `detail` carries the site's fact sentence verbatim.
 */
export class KnowledgeDefinitionInvalid extends Data.TaggedError("KnowledgeDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A Knowledge filesystem step failed; `detail` carries the site's fact sentence. */
export class KnowledgeIoFailed extends Data.TaggedError("KnowledgeIoFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class KnowledgeInstallStateMissing extends Data.TaggedError("KnowledgeInstallStateMissing")<{
  readonly name: string;
  readonly kind: "tree-integrity" | "content-identity" | "staged-tree-integrity";
}> {}

/** An active external Knowledge bundle has no accepted lock resolution. */
export class KnowledgeResolutionMissing extends Data.TaggedError("KnowledgeResolutionMissing")<{
  readonly name: string;
}> {}

/** Knowledge desired state cannot be reconciled from an incomplete graph. */
export class KnowledgeDesiredStateUnreconcilable extends Data.TaggedError(
  "KnowledgeDesiredStateUnreconcilable",
) {}

/**
 * Locked Knowledge content cannot be restored from its source. `detail`
 * carries the site's fact sentence verbatim.
 */
export class KnowledgeUnavailable extends Data.TaggedError("KnowledgeUnavailable")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** An installed Knowledge bundle failed its observable postcondition. */
export class KnowledgeObservableContractViolated extends Data.TaggedError(
  "KnowledgeObservableContractViolated",
)<{
  readonly name: string;
}> {}

/** Every failure the Knowledge module constructs. */
export type KnowledgeManagerError =
  | KnowledgeDefinitionInvalid
  | KnowledgeIoFailed
  | KnowledgeInstallStateMissing
  | KnowledgeResolutionMissing
  | KnowledgeDesiredStateUnreconcilable
  | KnowledgeUnavailable
  | KnowledgeObservableContractViolated;
