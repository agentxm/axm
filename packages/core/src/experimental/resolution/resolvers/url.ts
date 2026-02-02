/**
 * URL resolver for unmatched URL-like inputs.
 *
 * Handles GitHub/GitLab HTTPS URLs, SSH URLs, and other HTTP URLs
 * that weren't caught by earlier resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Effect } from "effect";
import { parseSource } from "../../skills/source-parser.js";
import type { ExtensionRef, ResolutionOptions, SourceType } from "../types.js";

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
 * Map ParsedSource type to resolution SourceType.
 *
 * @experimental This API is unstable and may change without notice.
 */
const mapSourceType = (
  parsedType: "github" | "gitlab" | "local" | "direct-url" | "well-known",
): SourceType => {
  switch (parsedType) {
    case "github":
      return "github";
    case "gitlab":
      return "gitlab";
    case "direct-url":
      return "direct-url";
    case "well-known":
      return "well-known";
    case "local":
      return "path";
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
 * - Direct URLs: `https://example.com/skill.md`
 * - Well-known URLs: `https://example.com` (base URL for /.well-known/skills/)
 *
 * This is the last resolver in the pipeline - catches any URL-like inputs
 * that weren't handled by earlier resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve
 * @param _options - Resolution options (unused currently)
 * @returns Effect containing array of ExtensionRefs, or empty array if not a match
 */
export const resolveUrl = (
  input: string,
  _options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never> => {
  const trimmed = input.trim();

  // Return empty array if input doesn't look like a URL
  if (!looksLikeUrl(trimmed)) {
    return Effect.succeed([]);
  }

  // Use existing parseSource for the heavy lifting
  return parseSource(trimmed).pipe(
    Effect.map((parsed) => {
      // Handle github/gitlab sources
      if (parsed.type === "github" || parsed.type === "gitlab") {
        // Ensure we have owner and repo
        if (!parsed.owner || !parsed.repo) {
          return [];
        }

        const ref: ExtensionRef = {
          type: "skill", // Infer as skill for now (will be enhanced later with manifest fetch)
          source: parsed.type,
          origin: buildOriginUrl(parsed.type, parsed.owner, parsed.repo),
          originalInput: input,
          metadata: {},
          ...(parsed.ref && { ref: parsed.ref }),
          ...(parsed.path && { path: parsed.path }),
        };

        return [ref];
      }

      // Handle direct-url and well-known sources
      if (parsed.type === "direct-url" || parsed.type === "well-known") {
        const ref: ExtensionRef = {
          type: "skill", // Infer as skill for now
          source: mapSourceType(parsed.type),
          origin: trimmed, // Use the URL itself as the origin
          originalInput: input,
          metadata: {},
        };

        return [ref];
      }

      // Local paths shouldn't be handled by URL resolver
      return [];
    }),
    // On parse error, return empty array (not a match for this resolver)
    Effect.catchAll(() => Effect.succeed([])),
  );
};
