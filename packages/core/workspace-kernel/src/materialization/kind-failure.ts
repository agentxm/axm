/**
 * The kernel's contract for a failure an extension kind constructs. A kind's
 * error classes carry this brand together with the rendering data the kind
 * chose — category, sentence, recoveries, and cause — so the kernel renders
 * every kind's failures once, structurally, without naming a kind.
 *
 * The brand has no `_tag`: each kind error class keeps its own literal tag for
 * narrowing inside the kind, and a union that includes the brand never widens
 * tag narrowing for the other members.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { hasProperty } from "effect/Predicate";

import type { FailureSuggestedAction, ErrorCode } from "../operations/index.js";

export const ExtensionKindFailureTypeId: unique symbol = Symbol.for(
  "@agentxm/workspace-kernel/materialization/ExtensionKindFailure",
);

/** A failure an extension kind constructs, carrying its own rendering. */
export interface ExtensionKindFailure {
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId;
  readonly category: ErrorCode;
  readonly detail: string;
  readonly recover?: string | undefined;
  readonly cmd?: string | undefined;
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction> | undefined;
  readonly cause?: unknown;
}

/** Whether an untyped failure is one an extension kind constructed. */
export const isExtensionKindFailure = (failure: unknown): failure is ExtensionKindFailure =>
  hasProperty(failure, ExtensionKindFailureTypeId);

/**
 * The tag that names a failure's class. Every kernel family declares its tag,
 * and every extension kind's error class keeps its own although the brand
 * declares none, so a kind failure's tag is read from the instance.
 */
export const failureTag = (failure: { readonly _tag: string } | ExtensionKindFailure): string =>
  "_tag" in failure && typeof failure._tag === "string" ? failure._tag : failure.constructor.name;
