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
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import type * as Option from "effect/Option";
import type {
  ContainerIdentity,
  ContainerIdentityContext,
  ContainerReceipt,
} from "../locations/index.js";

export interface NativeInsertionTarget {
  readonly path: string;
  readonly unit: string;
  readonly aliases?: ReadonlyArray<string>;
}

/** Ephemeral pre-write proof. Raw text never enters the persisted receipt. */
export interface NativeInsertionCapture {
  readonly target: NativeInsertionTarget;
  readonly context: ContainerIdentityContext;
  readonly beforeRaw: Option.Option<string>;
  readonly beforeIdentity: Option.Option<ContainerIdentity>;
  readonly anchor: Option.Option<ContainerIdentity>;
  readonly physicalPath: string;
  readonly eligible: boolean;
  readonly receipts: ReadonlyArray<ContainerReceipt>;
  readonly missingDirectories: ReadonlyArray<string>;
}

export interface NativeDirectoryCapture {
  readonly target: NativeInsertionTarget;
  readonly physicalPath: string;
  readonly anchor: ContainerIdentity;
  readonly missingDirectories: ReadonlyArray<string>;
  readonly eligible: boolean;
}

export type NativeInsertionResolution =
  { readonly kind: "restore-text"; readonly text: string } | { readonly kind: "remove-file" };

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
  readonly createParentDirectories: (
    target: string,
  ) => Effect.Effect<
    ReadonlyArray<ContainerIdentity>,
    NativeWriteRefused,
    FileSystem.FileSystem | Path.Path
  >;
  readonly captureCreatedDirectories: (
    args: NativeInsertionTarget & { readonly eligible: boolean },
  ) => Effect.Effect<NativeDirectoryCapture, NativeWriteRefused>;
  readonly recordCreatedDirectories: (args: {
    readonly capture: NativeDirectoryCapture;
    readonly createdDirectories: ReadonlyArray<ContainerIdentity>;
  }) => Effect.Effect<void, NativeWriteRefused>;
  readonly retireCreatedDirectories: (
    args: NativeInsertionTarget,
  ) => Effect.Effect<void, NativeWriteRefused>;
  readonly captureInsertion: (
    args: NativeInsertionTarget & {
      readonly beforeRaw: Option.Option<string>;
      readonly eligible: boolean;
    },
  ) => Effect.Effect<NativeInsertionCapture, NativeWriteRefused>;
  readonly recordInsertion: (args: {
    readonly capture: NativeInsertionCapture;
    readonly afterRaw: string;
    readonly createdDirectories: ReadonlyArray<ContainerIdentity>;
  }) => Effect.Effect<void, NativeWriteRefused>;
  readonly resolveInsertion: (
    args: NativeInsertionTarget & { readonly raw: string },
  ) => Effect.Effect<Option.Option<NativeInsertionResolution>, NativeWriteRefused>;
  readonly resolveInsertions: (
    args: Omit<NativeInsertionTarget, "unit"> & {
      readonly units: ReadonlyArray<string>;
      readonly raw: string;
    },
  ) => Effect.Effect<Option.Option<NativeInsertionResolution>, NativeWriteRefused>;
  readonly forgetInsertion: (
    args: NativeInsertionTarget,
  ) => Effect.Effect<void, NativeWriteRefused>;
  /** `empty` is the format owner's proof that no unowned units remain. */
  readonly retireInsertion: (
    args: NativeInsertionTarget & { readonly raw: string; readonly empty: boolean },
  ) => Effect.Effect<boolean, NativeWriteRefused>;
  /** Serialize a target's complete read/modify/write within this invocation. */
  readonly withExclusiveWrite: <A, E, R>(
    absolutePath: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | NativeWriteRefused, R>;
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
>()("@agentxm/workspace-kernel/agent-adapters/NativeWriteAuthority") {}
