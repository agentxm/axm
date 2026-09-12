/**
 * Accepted-resolution writer: lockfile-only mutations of the selected scope.
 * Each commit merges the lockfile snapshot per entry, keeps an accepted
 * resolution that is semantically unchanged byte-identical, and is
 * serialized by the workspace's mutation mutex.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import type * as Semaphore from "effect/Semaphore";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { commitLockfileSnapshotUpdateAtPath } from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { lockEntries, type LockEntryByType } from "./entry-accessors.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { WorkspaceLockfileMutationFailure } from "./service-interface.js";
import { WorkspaceStateShared } from "./shared.js";
import { readLockfileCell } from "./state-cells.js";

type Write = Effect.Effect<
  void,
  WorkspaceLockfileMutationFailure,
  FileSystem.FileSystem | Path.Path
>;

export interface AcceptedResolutionWriterService {
  /**
   * Record one accepted resolution under its lock key (the workspace name,
   * or the MCP resolution key). A skill or subagent resolution that is
   * semantically unchanged is not rewritten.
   */
  readonly setAccepted: <T extends InstallableExtensionType>(
    type: T,
    key: string,
    entry: LockEntryByType[T],
  ) => Write;
  /** Remove one accepted resolution. No-op when absent. */
  readonly removeAccepted: (type: InstallableExtensionType, key: string) => Write;
}

export class AcceptedResolutionWriter extends ServiceMap.Service<
  AcceptedResolutionWriter,
  AcceptedResolutionWriterService
>()("@agentxm/workspace-state/AcceptedResolutionWriter") {}

const normalizeForStableCompare = (value: unknown): unknown => {
  if (DateTime.isDateTime(value)) return DateTime.formatIso(value);
  if (Array.isArray(value)) return value.map(normalizeForStableCompare);
  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      normalized[key] = normalizeForStableCompare(entryValue);
    }
    return normalized;
  }
  return value;
};

/** Structural equality that treats date-times by their ISO rendering. */
export const stableCompare = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalizeForStableCompare(left)) ===
  JSON.stringify(normalizeForStableCompare(right));

export const lockEntrySemanticallyEqual = <TEntry>(
  current: TEntry | undefined,
  next: TEntry,
): boolean => current !== undefined && stableCompare(current, next);

/** Keep the recorded object when the replacement carries the same facts. */
export const preserveAcceptedResolutionOnNoop = <TEntry>(
  current: TEntry | undefined,
  next: TEntry,
): TEntry => (lockEntrySemanticallyEqual(current, next) && current !== undefined ? current : next);

export const makeAcceptedResolutionWriter = (
  location: WorkspaceLocationService,
  mutex: Semaphore.Semaphore,
): AcceptedResolutionWriterService => {
  const current = readLockfileCell(location, location.runtimeDir);
  const commit = (base: Lockfile, next: Lockfile) =>
    commitLockfileSnapshotUpdateAtPath(location.lockPath, base, next);
  const serialized = mutex.withPermits(1);
  return {
    setAccepted: (type, key, entry) =>
      serialized(
        Effect.gen(function* () {
          const lockfile = yield* current;
          const accessor = lockEntries[type];
          const previous = accessor.entries(lockfile)[key];
          if (lockEntrySemanticallyEqual(previous, entry)) return;
          yield* commit(
            lockfile,
            accessor.set(lockfile, key, preserveAcceptedResolutionOnNoop(previous, entry)),
          );
        }),
      ).pipe(Effect.withSpan("AcceptedResolutionWriter.setAccepted")),
    removeAccepted: (type, key) =>
      serialized(
        Effect.gen(function* () {
          const lockfile = yield* current;
          const accessor = lockEntries[type];
          if (accessor.entries(lockfile)[key] === undefined) return;
          yield* commit(lockfile, accessor.remove(lockfile, key));
        }),
      ).pipe(Effect.withSpan("AcceptedResolutionWriter.removeAccepted")),
  };
};

export const AcceptedResolutionWriterLive: Layer.Layer<
  AcceptedResolutionWriter,
  never,
  WorkspaceLocation | WorkspaceStateShared
> = Layer.effect(
  AcceptedResolutionWriter,
  Effect.gen(function* () {
    return makeAcceptedResolutionWriter(
      yield* WorkspaceLocation,
      (yield* WorkspaceStateShared).mutex,
    );
  }),
);
