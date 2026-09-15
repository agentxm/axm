/**
 * Per-type lockfile reads, keyed by catalog extension type.
 *
 * `LockfileReader` exposes one total accessor over the installable types. The
 * helpers here retain catalog-type narrowing for callers that work over the
 * callers that work over the whole catalog — installed-identifier resolution,
 * `<type> show` — stay total without a switch of their own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import type * as Effect from "effect/Effect";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  KnowledgeLockMap,
  McpServerLockEntry,
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
  | KnowledgeLockEntry;

export type AnyLockMap = { readonly [name: string]: AnyLockEntry };

/**
 * The `satisfies Record<CatalogExtensionType, …>` is load-bearing: a new
 * catalog type fails compile here until it is wired, instead of silently
 * resolving to an empty lock map.
 */
/** Read the whole lock map for one catalog extension type. */
export const getLockedEntries = (lockfile: LockfileReaderService, type: CatalogExtensionType) =>
  lockfile.entries(type);

/** Read accepted external Knowledge resolutions from the workspace lockfile. */
export const getKnowledgeLockEntries = (
  lockfile: LockfileReaderService,
): Effect.Effect<KnowledgeLockMap, WorkspaceLockfileReadFailure> => lockfile.entries("knowledge");

/** Resolved version for a lock entry, when its source arm carries one. */
export const lockEntryVersion = (entry: AnyLockEntry): string | null => {
  if (entry.type === "registry") return entry.resolvedVersion;
  return null;
};
