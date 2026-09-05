/**
 * Typed failure family for the hook manager and managed hook-group editing.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * A hook package, binding, or projection input did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class HookDefinitionInvalid extends Data.TaggedError("HookDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** An agent hooks configuration file did not parse or validate. */
export class HookConfigInvalid extends Data.TaggedError("HookConfigInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A hook filesystem step failed; `detail` carries the site's fact sentence. */
export class HookIoFailed extends Data.TaggedError("HookIoFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class HookInstallStateMissing extends Data.TaggedError("HookInstallStateMissing")<{
  readonly name: string;
  readonly kind: "tree-integrity" | "content-identity";
}> {}

/** Every failure the hook manager constructs. */
export type HookManagerError =
  HookDefinitionInvalid | HookConfigInvalid | HookIoFailed | HookInstallStateMissing;
