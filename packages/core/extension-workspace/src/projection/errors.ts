/**
 * Typed failure family for shared projection: aggregate contributor
 * resolution and managed-region reconciliation. Fields are domain facts; the
 * application error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/** Aggregate writes are gated on a completely enumerable desired-state graph. */
export class DesiredStateIncomplete extends Data.TaggedError("DesiredStateIncomplete")<{
  /** Rendered pack and declaration problem text. */
  readonly problems: string;
}> {}

/** User workspaces cannot contribute workspace-authored packages. */
export class AuthoredContributorUnsupported extends Data.TaggedError(
  "AuthoredContributorUnsupported",
)<{
  readonly type: string;
}> {}

/** A workspace-authored contributor's identity did not parse to its type. */
export class ContributorIdentityInvalid extends Data.TaggedError("ContributorIdentityInvalid")<{
  readonly type: string;
  readonly identity: string;
}> {}

/** An active contributor has no accepted lock resolution. */
export class ContributorUnresolved extends Data.TaggedError("ContributorUnresolved")<{
  readonly type: string;
  readonly name: string;
}> {}

/** The materialized package tree does not match the accepted lock entry. */
export class ContributorTreeMismatch extends Data.TaggedError("ContributorTreeMismatch")<{
  readonly packageRoot: string;
}> {}

/** The managed-region target file type does not support comment markers. */
export class ProjectionTargetUnsupported extends Data.TaggedError("ProjectionTargetUnsupported")<{
  /** The complete refusal sentence; call sites own type-specific wording. */
  readonly detail: string;
}> {}

/** A managed region exists but cannot be reconciled without guessing. */
export class ManagedRegionViolation extends Data.TaggedError("ManagedRegionViolation")<{
  readonly displayPath: string;
  /** The inspection's message for malformed or unsupported-version regions. */
  readonly reason?: string;
}> {}

/** A managed-region filesystem step failed. */
export class ProjectionIoFailed extends Data.TaggedError("ProjectionIoFailed")<{
  readonly path: string;
  readonly step: "inspect" | "read" | "reconcile";
  readonly cause: unknown;
}> {}

/** Every failure the shared projection module constructs. */
export type ProjectionError =
  | DesiredStateIncomplete
  | AuthoredContributorUnsupported
  | ContributorIdentityInvalid
  | ContributorUnresolved
  | ContributorTreeMismatch
  | ProjectionTargetUnsupported
  | ManagedRegionViolation
  | ProjectionIoFailed;
