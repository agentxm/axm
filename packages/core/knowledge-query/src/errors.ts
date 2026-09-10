/**
 * The typed failures Knowledge discovery reports to its caller.
 *
 * Every one carries the facts a caller needs to recover or render: what was
 * refused, and why. The CLI maps them onto exit codes and envelopes; it never
 * re-derives the decision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/** A discovery request that the published grammar or bounds refuse. */
export class KnowledgeRequestInvalid extends Data.TaggedError("KnowledgeRequestInvalid")<{
  readonly detail: string;
}> {}

/** The selected installed corpus could not be captured. */
export class KnowledgeCorpusUnavailable extends Data.TaggedError("KnowledgeCorpusUnavailable")<{
  readonly reason: "desired-state-incomplete" | "bundle-not-installed" | "source-unreadable";
  readonly detail: string;
  readonly bundle?: string;
  readonly cause?: unknown;
}> {}

/** An exact concept reference named nothing in the selected corpus. */
export class KnowledgeConceptNotFound extends Data.TaggedError("KnowledgeConceptNotFound")<{
  readonly reference: string;
}> {}
