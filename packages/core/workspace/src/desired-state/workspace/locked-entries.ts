/**
 * Per-type lockfile reads, keyed by installable extension type.
 *
 * `LockfileReader` exposes one total accessor over the installable types. The
 * helpers here keep installed-identifier resolution and `<type> show` total
 * without a switch of their own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type * as Effect from "effect/Effect";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  KnowledgeLockMap,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { LockfileReaderService } from "./lockfile-reader.js";
import type { WorkspaceLockfileReadFailure } from "./contracts.js";

/**
 * Any per-type lock entry. Every arm of every lock union comes from the same
 * factory, so narrowing to `type === "registry"` yields `owner`, `name`, and
 * `resolvedVersion` uniformly no matter which type produced the entry.
 */
export type AnyLockEntry =
  | SkillLockEntry
  | SubagentLockEntry
  | McpServerLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

export type AnyLockMap = { readonly [name: string]: AnyLockEntry };

/**
 * The installable-type parameter is load-bearing: a new installable type fails
 * compile in the lock reader until it is wired, instead of silently resolving
 * to an empty lock map.
 */
/** Read the whole lock map for one installable extension type. */
export const getLockedEntries = (lockfile: LockfileReaderService, type: InstallableExtensionType) =>
  lockfile.entries(type);

/** Read accepted external Knowledge resolutions from the workspace lockfile. */
export const getKnowledgeLockEntries = (
  lockfile: LockfileReaderService,
): Effect.Effect<KnowledgeLockMap, WorkspaceLockfileReadFailure> => lockfile.entries("knowledge");

/** Resolved version for a lock entry, when its source arm carries one. */
export const lockEntryVersion = (entry: AnyLockEntry): string | null => {
  if (entry.source.type === "registry" && "version" in entry.resolved) {
    return entry.resolved.version;
  }
  return null;
};
