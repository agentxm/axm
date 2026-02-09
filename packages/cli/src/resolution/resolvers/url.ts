/**
 * URL resolver for unmatched URL-like inputs.
 *
 * Handles GitHub/GitLab HTTPS URLs, SSH URLs, and other HTTP URLs
 * that weren't caught by earlier resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseSourceInput } from "../../sources/index.js";
import type { ExtensionRef } from "../types.js";

/**
 * URL pattern for detecting URL-like inputs.
 * Matches: https://, http://, git@
 *
 * @experimental This API is unstable and may change without notice.
 */
const URL_PATTERN = /^(?:https?:\/\/|git@)/;

/**
 * Check if input looks like a URL.
 *
 * @experimental This API is unstable and may change without notice.
 */
const looksLikeUrl = (input: string): boolean => {
  return URL_PATTERN.test(input);
};

/**
 * Build HTTPS URL from source type and owner/repo.
 *
 * @experimental This API is unstable and may change without notice.
 */
const buildOriginUrl = (sourceType: "github" | "gitlab", owner: string, repo: string): string => {
  switch (sourceType) {
    case "github":
      return `https://github.com/${owner}/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${owner}/${repo}`;
  }
};

/**
 * Resolve URL-like inputs to ExtensionRefs.
 *
 * Handles:
 * - GitHub HTTPS URLs: `https://github.com/owner/repo`
 * - GitLab HTTPS URLs: `https://gitlab.com/owner/repo`
 * - GitHub SSH URLs: `git@github.com:owner/repo.git`
 * - GitLab SSH URLs: `git@gitlab.com:owner/repo.git`
 *
 * This is the last resolver in the pipeline - catches any URL-like inputs
 * that weren't handled by earlier resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve
 * @param _options - Resolution options (unused currently)
 * @returns Effect containing array of ExtensionRefs, or empty array if not a match
 */
export const resolveUrl = (input: string): Effect.Effect<ExtensionRef[], never> => {
  const trimmed = input.trim();

  // Return empty array if input doesn't look like a URL
  if (!looksLikeUrl(trimmed)) {
    return Effect.succeed([]);
  }

  // Use existing parseSourceInput for the heavy lifting
  return parseSourceInput(trimmed).pipe(
    Effect.map((src) => {
      // Handle github/gitlab sources
      if (src.source === "github" || src.source === "gitlab") {
        const ref: ExtensionRef = {
          type: "skill", // Infer as skill for now (will be enhanced later with manifest fetch)
          source: src.source,
          origin: buildOriginUrl(src.source, src.owner, src.repo),
          originalInput: input,
          name: Option.none(),
          ref: src.ref,
          path: src.subPath,
          metadata: {
            version: Option.none(),
            description: Option.none(),
            files: Option.none(),
            versionConstraint: Option.none(),
          },
        };

        return [ref];
      }

      // Other source types (bitbucket, git, registry) not yet supported by URL resolver
      return [];
    }),
    // On parse error, return empty array (not a match for this resolver)
    Effect.catchAll(() => Effect.succeed([])),
  );
};
