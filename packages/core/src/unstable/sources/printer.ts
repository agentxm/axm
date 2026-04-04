/**
 * Source printer for canonical shorthand strings and lock entry conversion.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type { CommandLockEntry, McpServerLockEntry, SkillLockEntry } from "../lockfile/schema.js";
import { print as azurereposPrint } from "../source-resolution/providers/azurerepos/index.js";
import { print as bitbucketPrint } from "../source-resolution/providers/bitbucket/index.js";
import { print as githubPrint } from "../source-resolution/providers/github/index.js";
import { print as gitlabPrint } from "../source-resolution/providers/gitlab/index.js";
import { print as localPrint } from "../source-resolution/providers/local-parser/index.js";
import type { SourceParams } from "./types.js";

type SourceLockEntry = SkillLockEntry | CommandLockEntry | McpServerLockEntry;

/**
 * Print source params as their canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceParams = (source: SourceParams): string => {
  switch (source.type) {
    case "github":
      return githubPrint(source);
    case "gitlab":
      return gitlabPrint(source);
    case "bitbucket":
      return bitbucketPrint(source);
    case "azurerepos":
      return azurereposPrint(source);
    case "local":
      return localPrint(source);
    case "git":
      return source.url.href;
    case "registry": {
      return "registry";
    }
    case "builtin":
      return "builtin";
  }
};

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
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "gitlab":
      return {
        type: "gitlab",
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "bitbucket":
      return {
        type: "bitbucket",
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      };
    case "azurerepos":
      return {
        type: "azurerepos",
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
        owner: Option.none(),
      };
    case "builtin":
      return { type: "builtin" };
  }
};
