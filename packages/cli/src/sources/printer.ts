/**
 * Source printer for canonical shorthand strings and lock entry conversion.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type { SkillLockEntry } from "../lockfile/schema.js";
import { print as azurereposPrint } from "./azurerepos/index.js";
import { print as bitbucketPrint } from "./bitbucket/index.js";
import { print as githubPrint } from "./github/index.js";
import { print as gitlabPrint } from "./gitlab/index.js";
import { print as localPrint } from "./local/index.js";
import type { SourceInput, SourceParams } from "./types.js";

/**
 * Print a source input as its canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceInput = (source: SourceInput | SourceParams): string => {
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
      const base = `${source.scope}/${source.name}`;
      return Option.isSome(source.versionConstraint)
        ? `${base}@${source.versionConstraint.value}`
        : base;
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
export const lockEntryToSourceParams = (entry: SkillLockEntry): SourceParams => {
  switch (entry.type) {
    case "github":
      return {
        type: "github",
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromNullable(entry.ref),
        subPath: Option.fromNullable(entry.path),
      };
    case "gitlab":
      return {
        type: "gitlab",
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromNullable(entry.ref),
        subPath: Option.fromNullable(entry.path),
      };
    case "bitbucket":
      return {
        type: "bitbucket",
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromNullable(entry.ref),
        subPath: Option.fromNullable(entry.path),
      };
    case "azurerepos":
      return {
        type: "azurerepos",
        organization: entry.organization,
        project: entry.project,
        repo: entry.repo,
        ref: Option.fromNullable(entry.ref),
        subPath: Option.fromNullable(entry.path),
      };
    case "git":
      return {
        type: "git",
        url: new URL(entry.url),
        ref: Option.fromNullable(entry.ref),
      };
    case "local":
      return { type: "local", path: entry.path };
    case "registry":
      return {
        type: "registry",
        scope: entry.scope,
        name: entry.name,
        versionConstraint: Option.none(),
      };
    case "builtin":
      return { type: "builtin" };
  }
};

/**
 * @deprecated Use lockEntryToSourceParams
 * @experimental This API is unstable and may change without notice.
 */
export const lockEntryToSourceInput = lockEntryToSourceParams;
