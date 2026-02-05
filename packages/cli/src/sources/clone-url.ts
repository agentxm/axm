/**
 * Clone URL building utilities for parsed sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { CloneUrlError } from "./errors.js";
import type { ParsedSource } from "./types.js";

/**
 * Build a git clone URL from a parsed source.
 *
 * Only works for GitHub, GitLab, and Bitbucket sources. Returns CloneUrlError for other types.
 *
 * @experimental This API is unstable and may change without notice.
 * @param parsed - The parsed source to build a clone URL for
 * @returns Effect containing the HTTPS clone URL or CloneUrlError
 */
export const buildCloneUrl = (parsed: ParsedSource): Effect.Effect<string, CloneUrlError> => {
  switch (parsed.source) {
    case "github":
      return Effect.succeed(`https://github.com/${parsed.owner}/${parsed.repo}.git`);
    case "gitlab":
      return Effect.succeed(`https://gitlab.com/${parsed.owner}/${parsed.repo}.git`);
    case "bitbucket":
      return Effect.succeed(`https://bitbucket.org/${parsed.owner}/${parsed.repo}.git`);
    default:
      return Effect.fail(
        new CloneUrlError({
          message: `Cannot build clone URL for source type: ${parsed.source}`,
          sourceType: parsed.source,
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
export const getOriginFromParsed = (parsed: ParsedSource): string => {
  switch (parsed.source) {
    case "github":
      return `https://github.com/${parsed.owner}/${parsed.repo}`;
    case "gitlab":
      return `https://gitlab.com/${parsed.owner}/${parsed.repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${parsed.owner}/${parsed.repo}`;
    case "azuredevops":
      return `https://dev.azure.com/${parsed.owner}/${parsed.repo}`;
    case "local":
      return parsed.original;
    case "wellknown":
      return parsed.baseUrl;
    case "git":
    case "registry":
      return parsed.original;
  }
};
