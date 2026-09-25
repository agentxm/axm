/**
 * Per-type lockfile reads, keyed by installable extension type.
 *
 * `LockfileReader` exposes one total accessor over the installable types. The
 * helpers here keep installed-identifier resolution and `<type> show` total
 * without a switch of their own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";

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

/** Resolved version for a lock entry, when its source arm carries one. */
export const lockEntryVersion = (entry: AnyLockEntry): string | null => {
  if (entry.source.type === "registry" && "version" in entry.resolved) {
    return entry.resolved.version;
  }
  return null;
};
