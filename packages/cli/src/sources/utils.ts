/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";

import type { ParsedSource } from "./types.js";

/**
 * Build a ParsedSource for local paths.
 */
export const buildLocalSource = (original: string, path: string): ParsedSource => ({
  type: "local",
  original,
  canonical: `local:${path}`,
  owner: Option.none(),
  repo: Option.none(),
  ref: Option.none(),
  path: Option.none(),
  url: Option.none(),
  localPath: Option.some(path),
  baseUrl: Option.none(),
});

/**
 * Build a ParsedSource for well-known HTTP(S) sources.
 */
export const buildWellKnownSource = (original: string, baseUrl: string): ParsedSource => ({
  type: "wellknown",
  original,
  canonical: `wellknown:${baseUrl}`,
  owner: Option.none(),
  repo: Option.none(),
  ref: Option.none(),
  path: Option.none(),
  url: Option.none(),
  localPath: Option.none(),
  baseUrl: Option.some(baseUrl),
});

/**
 * Build a ParsedSource for GitHub/GitLab/Bitbucket sources.
 */
export const buildGitSource = (
  type: "github" | "gitlab" | "bitbucket",
  original: string,
  owner: string,
  repo: string,
  ref?: string,
  path?: string,
): ParsedSource => ({
  type,
  original,
  canonical: `${type}:${owner}/${repo}`,
  owner: Option.some(owner),
  repo: Option.some(repo),
  ref: Option.fromNullable(ref),
  path: Option.fromNullable(path),
  url: Option.none(),
  localPath: Option.none(),
  baseUrl: Option.none(),
});
