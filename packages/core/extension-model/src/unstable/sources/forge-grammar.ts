/**
 * Pure per-forge source shorthand printing grammar.
 *
 * Each printer formats source params as the forge's canonical shorthand
 * string. Probing and acquisition stay with the source-resolution providers;
 * only the string grammar lives here.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";

import type {
  AzureReposSourceParams,
  BitbucketSourceParams,
  GitHubSourceParams,
  GitLabSourceParams,
  LocalSourceParams,
} from "./types.js";

/** @experimental */
export const printGitHubSource = (
  source: GitHubSourceParams,
  sourceName = source.sourceName ?? "github",
) => {
  let s = `${sourceName}:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `//${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};

/** @experimental */
export const printGitLabSource = (
  source: GitLabSourceParams,
  sourceName = source.sourceName ?? "gitlab",
) => {
  let s = `${sourceName}:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `//${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};

/** @experimental */
export const printBitbucketSource = (
  source: BitbucketSourceParams,
  sourceName = source.sourceName ?? "bitbucket",
) => {
  let s = `${sourceName}:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `//${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};

/** @experimental */
export const printAzureReposSource = (
  source: AzureReposSourceParams,
  sourceName = source.sourceName ?? "azurerepos",
) => {
  let s = `${sourceName}:${source.organization}/${source.project}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `//${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};

/** @experimental */
export const printLocalSource = (source: LocalSourceParams) =>
  source.path.startsWith("/") || source.path.startsWith(".") ? source.path : `./${source.path}`;
