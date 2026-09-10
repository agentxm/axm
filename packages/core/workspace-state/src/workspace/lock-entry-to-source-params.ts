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
  switch (entry.type) {
    case "github":
      return {
        type: "github",
        sourceName: entry.sourceName,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "gitlab":
      return {
        type: "gitlab",
        sourceName: entry.sourceName,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "bitbucket":
      return {
        type: "bitbucket",
        sourceName: entry.sourceName,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "azurerepos":
      return {
        type: "azurerepos",
        sourceName: entry.sourceName,
        organization: entry.organization,
        project: entry.project,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "git":
      return {
        type: "git",
        url: new URL(entry.url),
        ref: Option.fromUndefinedOr(entry.ref),
      };
    case "local":
      return { type: "local", path: entry.path };
    case "registry":
      return {
        type: "registry",
        sourceName: entry.sourceName,
        owner: Option.none(),
      };
  }
};

/**
 * Print the exact source locator represented by an accepted Skill resolution.
 * Registry rows include their immutable identity and resolved version; other
 * rows round-trip through their source-specific shorthand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSkillLockSourceLocator = (_lockName: string, entry: SkillLockEntry): string =>
  entry.type === "registry"
    ? `${entry.sourceName}:${formatFqn({ owner: entry.owner, type: "skill", name: entry.name })}@${entry.resolvedVersion}`
    : printSourceParams(lockEntryToSourceParams(entry));
