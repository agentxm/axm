/**
 * Clone URL building utilities for parsed sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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
  const owner = Option.getOrElse(parsed.owner, () => "");
  const repo = Option.getOrElse(parsed.repo, () => "");
  if (parsed.type === "github") {
    return Effect.succeed(`https://github.com/${owner}/${repo}.git`);
  }
  if (parsed.type === "gitlab") {
    return Effect.succeed(`https://gitlab.com/${owner}/${repo}.git`);
  }
  if (parsed.type === "bitbucket") {
    return Effect.succeed(`https://bitbucket.org/${owner}/${repo}.git`);
  }
  return Effect.fail(
    new CloneUrlError({
      message: `Cannot build clone URL for source type: ${parsed.type}`,
      sourceType: parsed.type,
    }),
  );
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
  const owner = Option.getOrElse(parsed.owner, () => "");
  const repo = Option.getOrElse(parsed.repo, () => "");
  switch (parsed.type) {
    case "github":
      return `https://github.com/${owner}/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${owner}/${repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${owner}/${repo}`;
    case "azuredevops":
      return `https://dev.azure.com/${owner}/${repo}`;
    case "local":
      return parsed.original;
    case "wellknown":
      return Option.getOrElse(parsed.baseUrl, () => parsed.original);
    case "git":
    case "registry":
      return parsed.original;
  }
};
