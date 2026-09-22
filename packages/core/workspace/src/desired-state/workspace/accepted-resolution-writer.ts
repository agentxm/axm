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
import * as Layer from "effect/Layer";
import type * as Semaphore from "effect/Semaphore";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import { lockEntries, type LockEntryByType } from "./entry-accessors.js";
import type { WorkspaceLockfileMutationFailure } from "./contracts.js";
import { WorkspaceStateShared } from "./shared.js";

type Write = Effect.Effect<void, WorkspaceLockfileMutationFailure>;

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
  /** Remove all selected resolutions with one lockfile read and commit. */
  readonly removeAcceptedEntries: (
    entries: ReadonlyArray<{ readonly type: InstallableExtensionType; readonly key: string }>,
  ) => Write;
}

export class AcceptedResolutionWriter extends ServiceMap.Service<
  AcceptedResolutionWriter,
  AcceptedResolutionWriterService
>()("@agentxm/workspace/desired-state/AcceptedResolutionWriter") {}

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
  documents: WorkspaceDocumentsService,
  mutex: Semaphore.Semaphore,
): AcceptedResolutionWriterService => {
  const current = documents.acceptedResolutions;
  const commit = documents.commitAcceptedResolutions;
  const serialized = mutex.withPermits(1);
  const removeAcceptedEntries = (
    entries: ReadonlyArray<{ readonly type: InstallableExtensionType; readonly key: string }>,
  ): Write =>
    serialized(
      Effect.gen(function* () {
        if (entries.length === 0) return;
        const base = yield* current;
        let next = base;
        for (const { type, key } of entries) {
          const accessor = lockEntries[type];
          if (accessor.entries(next)[key] !== undefined) {
            next = accessor.remove(next, key);
          }
        }
        if (next !== base) yield* commit(base, next);
      }),
    ).pipe(Effect.withSpan("AcceptedResolutionWriter.removeAcceptedEntries"));
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
    removeAccepted: (type, key) => removeAcceptedEntries([{ type, key }]),
    removeAcceptedEntries,
  };
};

export const AcceptedResolutionWriterLive: Layer.Layer<
  AcceptedResolutionWriter,
  never,
  WorkspaceDocuments | WorkspaceStateShared
> = Layer.effect(
  AcceptedResolutionWriter,
  Effect.gen(function* () {
    return makeAcceptedResolutionWriter(
      yield* WorkspaceDocuments,
      (yield* WorkspaceStateShared).mutex,
    );
  }),
);
