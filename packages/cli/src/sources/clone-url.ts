/**
 * Clone URL building utilities for sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { makeCliError } from "../cli-error/index.js";
import type { Source } from "./types.js";

/**
 * Build a git clone URL from a source.
 *
 * Only works for GitHub, GitLab, Bitbucket, and Azure Repos sources.
 * Returns CliError for other types.
 *
 * Uses the configured `url` field from the source config as the base URL.
 *
 * @experimental This API is unstable and may change without notice.
 * @param source - The resolved source to build a clone URL for
 * @returns Effect containing the HTTPS clone URL or CliError
 */
export const buildCloneUrl = (source: Source) => {
  switch (source.type) {
    case "github":
      return Effect.succeed(`${source.url.origin}/${source.owner}/${source.repo}.git`);
    case "gitlab":
      return Effect.succeed(`${source.url.origin}/${source.owner}/${source.repo}.git`);
    case "bitbucket":
      return Effect.succeed(`${source.url.origin}/${source.owner}/${source.repo}.git`);
    case "azurerepos":
      return Effect.succeed(
        `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`,
      );
    default:
      return Effect.fail(
        makeCliError({
          code: "SOURCE_CLONE_URL_FAILED",
          what: `Cannot build clone URL for source type: ${source.type}`,
        }),
      );
  }
};

/**
 * Get the origin URL from a source.
 *
 * Returns the human-readable URL or path for the source.
 * Uses the configured `url` field for git hosting sources.
 *
 * - For GitHub: {url}/owner/repo
 * - For GitLab: {url}/owner/repo
 * - For Bitbucket: {url}/owner/repo
 * - For Azure Repos: {url}/organization/project/_git/repo
 * - For local: the path
 * - For git/registry: the url or path
 *
 * @experimental This API is unstable and may change without notice.
 * @param source - The resolved source to get the origin from
 * @returns The origin URL or path
 */
export const getOrigin = (source: Source): string => {
  switch (source.type) {
    case "github":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "gitlab":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    case "local":
      return source.path;
    case "git":
      return source.url.href;
    case "registry":
      return source.type;
  }
};
