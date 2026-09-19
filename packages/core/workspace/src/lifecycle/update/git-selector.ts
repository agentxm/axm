/** Git selector movement policy used by configured update. */

import * as Semver from "semver";

import type { GitRemoteRefs } from "../../resolution/sources/git/operations.js";

export type GitSelectorAssessment =
  | { readonly kind: "branch" }
  | { readonly kind: "tag"; readonly newerTag?: string }
  | { readonly kind: "commit" }
  | { readonly kind: "unknown" };

const newerSemanticTag = (selector: string, tags: ReadonlyArray<string>): string | undefined => {
  const selected = Semver.parse(selector.replace(/^v/u, ""));
  if (selected === null) return undefined;
  return tags
    .flatMap((tag) => {
      const version = Semver.parse(tag.replace(/^v/u, ""));
      return version === null || Semver.lte(version, selected) ? [] : [{ tag, version }];
    })
    .sort((left, right) => Semver.rcompare(left.version, right.version))
    .at(0)?.tag;
};

/** Branches advance; advertised tags and commit selectors remain pinned. */
export const assessGitSelector = (
  selector: string,
  remote: GitRemoteRefs,
): GitSelectorAssessment => {
  if (remote.tags.includes(selector)) {
    const newerTag = newerSemanticTag(selector, remote.tags);
    return { kind: "tag", ...(newerTag === undefined ? {} : { newerTag }) };
  }
  if (remote.branches.includes(selector)) return { kind: "branch" };
  return /^[a-f0-9]{40}$/iu.test(selector) ? { kind: "commit" } : { kind: "unknown" };
};
