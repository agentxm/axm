/**
 * Clone URL building utilities for parsed sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { CloneUrlError } from "./errors.js";
import type { ParsedSource, Source } from "./types.js";

/**
 * Build a git clone URL from a parsed source.
 *
 * Only works for GitHub, GitLab, and Bitbucket sources. Returns CloneUrlError for other types.
 *
 * @experimental This API is unstable and may change without notice.
 * @param parsed - The parsed source to build a clone URL for
 * @returns Effect containing the HTTPS clone URL or CloneUrlError
 */
export const buildCloneUrl = (
  parsed: ParsedSource<Source>,
): Effect.Effect<string, CloneUrlError> => {
  const src = parsed.source;
  switch (src.source) {
    case "github":
      return Effect.succeed(`https://github.com/${src.owner}/${src.repo}.git`);
    case "gitlab":
      return Effect.succeed(`https://gitlab.com/${src.owner}/${src.repo}.git`);
    case "bitbucket":
      return Effect.succeed(`https://bitbucket.org/${src.owner}/${src.repo}.git`);
    default:
      return Effect.fail(
        new CloneUrlError({
          message: `Cannot build clone URL for source type: ${src.source}`,
          sourceType: src.source,
        }),
      );
  }
};

/**
 * Get the origin URL from a parsed source.
 *
 * Returns the human-readable URL or path for the source.
 * - For GitHub: https://github.com/owner/repo
 * - For GitLab: https://gitlab.com/owner/repo
 * - For Bitbucket: https://bitbucket.org/owner/repo
 * - For git/registry: the original string
 *
 * @experimental This API is unstable and may change without notice.
 * @param parsed - The parsed source to get the origin from
 * @returns The origin URL or path
 */
export const getOriginFromParsed = (parsed: ParsedSource<Source>): string => {
  const src = parsed.source;
  switch (src.source) {
    case "github":
      return `https://github.com/${src.owner}/${src.repo}`;
    case "gitlab":
      return `https://gitlab.com/${src.owner}/${src.repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${src.owner}/${src.repo}`;
    case "azurerepos":
      return `https://dev.azure.com/${src.organization}/${src.project}/_git/${src.repo}`;
    case "local":
    case "git":
    case "registry":
      return parsed.original;
  }
};
