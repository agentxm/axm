/**
 * Clone URL building utilities for sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { CloneUrlError } from "./errors.js";
import type { Source } from "./types.js";

/**
 * Build a git clone URL from a source.
 *
 * Only works for GitHub, GitLab, and Bitbucket sources. Returns CloneUrlError for other types.
 *
 * @experimental This API is unstable and may change without notice.
 * @param source - The source to build a clone URL for
 * @returns Effect containing the HTTPS clone URL or CloneUrlError
 */
export const buildCloneUrl = (source: Source): Effect.Effect<string, CloneUrlError> => {
  switch (source.source) {
    case "github":
      return Effect.succeed(`https://github.com/${source.owner}/${source.repo}.git`);
    case "gitlab":
      return Effect.succeed(`https://gitlab.com/${source.owner}/${source.repo}.git`);
    case "bitbucket":
      return Effect.succeed(`https://bitbucket.org/${source.owner}/${source.repo}.git`);
    default:
      return Effect.fail(
        new CloneUrlError({
          message: `Cannot build clone URL for source type: ${source.source}`,
          sourceType: source.source,
        }),
      );
  }
};

/**
 * Get the origin URL from a source.
 *
 * Returns the human-readable URL or path for the source.
 * - For GitHub: https://github.com/owner/repo
 * - For GitLab: https://gitlab.com/owner/repo
 * - For Bitbucket: https://bitbucket.org/owner/repo
 * - For local: the path
 * - For git/registry: the url or path
 *
 * @experimental This API is unstable and may change without notice.
 * @param source - The source to get the origin from
 * @returns The origin URL or path
 */
export const getOrigin = (source: Source): string => {
  switch (source.source) {
    case "github":
      return `https://github.com/${source.owner}/${source.repo}`;
    case "gitlab":
      return `https://gitlab.com/${source.owner}/${source.repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `https://dev.azure.com/${source.organization}/${source.project}/_git/${source.repo}`;
    case "local":
      return source.path;
    case "git":
    case "registry":
      return "url" in source ? source.url : source.path;
  }
};
