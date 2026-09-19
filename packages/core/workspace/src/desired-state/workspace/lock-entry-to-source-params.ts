/**
 * Lock entry to source-params conversion and lock-locator printing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type {
  McpServerLockEntry,
  PackLockEntry,
  HookLockEntry,
  KnowledgeLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/schema.js";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { SourceParams } from "@agentxm/extension-model/unstable/sources/types";

type SourceLockEntry =
  | SkillLockEntry
  | McpServerLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | SubagentLockEntry
  | PackLockEntry;

/**
 * Convert a skill lock entry back to a SourceParams.
 * Inverse of sourceToLockEntry (lock entry optional fields -> Option).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const lockEntryToSourceParams = (entry: SourceLockEntry): SourceParams => {
  switch (entry.source.type) {
    case "git":
      return {
        type: "git",
        url: entry.source.url,
        ref: Option.fromUndefinedOr(entry.source.revision),
      };
    case "path":
      return { type: "local", path: entry.source.path };
    case "registry":
      return {
        type: "registry",
        sourceName: entry.source.url.href,
        owner: Option.none(),
      };
  }
};

const knownGitHostPrefix = (url: URL): string | undefined => {
  switch (url.hostname.toLowerCase()) {
    case "github.com":
      return "github";
    case "gitlab.com":
      return "gitlab";
    case "bitbucket.org":
      return "bitbucket";
    default:
      return undefined;
  }
};

/** Whether a declaration locator denotes the self-described accepted source. */
export const lockEntryMatchesSourceLocator = (entry: SourceLockEntry, locator: string): boolean => {
  if (printSourceParams(lockEntryToSourceParams(entry)) === locator) return true;
  if (entry.source.type !== "git") return false;

  const prefix = knownGitHostPrefix(entry.source.url);
  if (prefix === undefined) return false;
  const repository = entry.source.url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  if (repository.length === 0) return false;
  const path = entry.source.path === undefined ? "" : `//${entry.source.path}`;
  const revision = entry.source.revision === undefined ? "" : `@${entry.source.revision}`;
  return locator === `${prefix}:${repository}${path}${revision}`;
};

/**
 * Print the exact source locator represented by an accepted Skill resolution.
 * Registry rows include their immutable identity and resolved version; other
 * rows round-trip through their source-specific shorthand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSkillLockSourceLocator = (_lockName: string, entry: SkillLockEntry): string =>
  entry.source.type === "registry" &&
  "version" in entry.resolved &&
  entry.identity.owner !== undefined
    ? `registry:${entry.source.url.href}:${formatFqn({ owner: entry.identity.owner, type: "skill", name: entry.identity.name })}@${entry.resolved.version}`
    : printSourceParams(lockEntryToSourceParams(entry));
