/**
 * Per-type lockfile reads, keyed by catalog extension type.
 *
 * `WorkspaceMutationsService` exposes one `getLockedX()` accessor per type. The
 * table here is the single place that maps a type id onto its accessor, so
 * callers that work over the whole catalog — installed-identifier resolution,
 * `<type> show` — stay total without a switch of their own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";

import type { AppError } from "../app-error/index.js";
import type { CatalogExtensionType } from "../extension-types/schema.js";
import type {
  CommandLockEntry,
  FilesLockEntry,
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { WorkspaceMutationsService } from "./service-interface.js";

/**
 * Any per-type lock entry. Every arm of every lock union comes from the same
 * factory, so narrowing to `type === "registry"` yields `owner`, `name`, and
 * `resolvedVersion` uniformly no matter which type produced the entry.
 */
export type AnyLockEntry =
  | SkillLockEntry
  | CommandLockEntry
  | SubagentLockEntry
  | McpServerLockEntry
  | FilesLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry;

export type AnyLockMap = { readonly [name: string]: AnyLockEntry };

/**
 * The `satisfies Record<CatalogExtensionType, …>` is load-bearing: a new
 * catalog type fails compile here until it is wired, instead of silently
 * resolving to an empty lock map.
 */
const lockedEntryReaders = {
  skill: (ws) => ws.getLockedSkills(),
  command: (ws) => ws.getLockedCommands(),
  "mcp-server": (ws) => ws.getLockedMcpServers(),
  subagent: (ws) => ws.getLockedSubagents(),
  files: (ws) => ws.getLockedFiles(),
  rule: (ws) => ws.getLockedRules(),
  hook: (ws) => ws.getLockedHooks(),
  knowledge: (ws) => ws.getLockedKnowledge(),
} as const satisfies Record<
  CatalogExtensionType,
  (ws: WorkspaceMutationsService) => Effect.Effect<AnyLockMap, AppError>
>;

/** Read the whole lock map for one catalog extension type. */
export const getLockedEntries = (
  ws: WorkspaceMutationsService,
  type: CatalogExtensionType,
): Effect.Effect<AnyLockMap, AppError> => lockedEntryReaders[type](ws);

/** Resolved version for a lock entry, when its source arm carries one. */
export const lockEntryVersion = (entry: AnyLockEntry): string | null => {
  if (entry.type === "registry") return entry.resolvedVersion;
  if (entry.type === "workspace") return entry.version;
  return null;
};
