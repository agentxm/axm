/**
 * Port for writing agent-native files under the enclosing workspace
 * transaction.
 *
 * Native writers own the file format; the workspace core owns protection and
 * durable-change accounting. A writer keeps `NativeWriteAuthority` in `R` and
 * never captures it, so the core capability that runs the transaction supplies
 * the implementation at the composition boundary.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";

/** The pre-mutation preimage of a native target could not be preserved. */
export class NativeWriteRefused extends Data.TaggedError("NativeWriteRefused")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** One durable change a native write made, reported for the operation footprint. */
export interface NativeWriteRecord {
  readonly path: string;
  readonly change: "created" | "modified" | "removed";
}

export interface NativeWriteAuthorityService {
  /**
   * Preserve the pre-mutation preimage of an absolute path. Fails before the
   * write when the preimage cannot be taken, so an unprotectable path is never
   * mutated.
   */
  readonly protect: (absolutePath: string) => Effect.Effect<void, NativeWriteRefused>;
  /** Report one durable change for the operation footprint. */
  readonly record: (change: NativeWriteRecord) => Effect.Effect<void>;
}

export class NativeWriteAuthority extends ServiceMap.Service<
  NativeWriteAuthority,
  NativeWriteAuthorityService
>()("@agentxm/agent-integration/NativeWriteAuthority") {}
