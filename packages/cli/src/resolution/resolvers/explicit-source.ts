/**
 * Explicit source resolver for prefixed inputs.
 *
 * Handles `github:owner/repo` and `gitlab:owner/repo` prefixed inputs
 * by wrapping the existing source-parser.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseSource } from "../../sources/index.js";
import type { ExtensionRef } from "../types.js";

/**
 * Supported source prefixes that this resolver handles.
 * These are the prefixes that the parser currently supports.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SUPPORTED_PREFIXES = ["github:", "gitlab:"] as const;

/**
 * Future source prefixes (recognized but not yet implemented in parser).
 *
 * @experimental This API is unstable and may change without notice.
 */
const FUTURE_PREFIXES = ["bitbucket:", "azure:"] as const;

/**
 * All known source prefixes.
 *
 * @experimental This API is unstable and may change without notice.
 */
const ALL_PREFIXES = [...SUPPORTED_PREFIXES, ...FUTURE_PREFIXES] as const;

/**
 * Check if input starts with a known source prefix.
 *
 * @experimental This API is unstable and may change without notice.
 */
const hasKnownPrefix = (input: string): boolean => {
  return ALL_PREFIXES.some((prefix) => input.startsWith(prefix));
};

/**
 * Check if input starts with a supported (implemented) source prefix.
 *
 * @experimental This API is unstable and may change without notice.
 */
const hasSupportedPrefix = (input: string): boolean => {
  return SUPPORTED_PREFIXES.some((prefix) => input.startsWith(prefix));
};

/**
 * Build HTTPS URL from source type and owner/repo.
 *
 * @experimental This API is unstable and may change without notice.
 */
const buildOriginUrl = (
  sourceType: "github" | "gitlab" | "bitbucket" | "azure",
  owner: string,
  repo: string,
): string => {
  switch (sourceType) {
    case "github":
      return `https://github.com/${owner}/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${owner}/${repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${owner}/${repo}`;
    case "azure":
      // Azure DevOps URL format: https://dev.azure.com/{org}/{project}/_git/{repo}
      // For simplicity, treating owner as org/project combined
      return `https://dev.azure.com/${owner}/${repo}`;
  }
};

/**
 * Resolve explicit source prefixed inputs to ExtensionRefs.
 *
 * Handles inputs like:
 * - `github:owner/repo`
 * - `github:owner/repo/path`
 * - `github:owner/repo@ref`
 * - `github:owner/repo/path@ref`
 * - `gitlab:owner/repo`
 * - (future: `bitbucket:owner/repo`, `azure:owner/repo`)
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve
 * @param _options - Resolution options (unused currently)
 * @returns Effect containing array of ExtensionRefs, or empty array if not a match
 */
export const resolveExplicitSource = (input: string): Effect.Effect<ExtensionRef[], never> => {
  const trimmed = input.trim();

  // Return empty array if input doesn't start with a known prefix
  if (!hasKnownPrefix(trimmed)) {
    return Effect.succeed([]);
  }

  // Return empty array for future prefixes not yet implemented in parser
  if (!hasSupportedPrefix(trimmed)) {
    return Effect.succeed([]);
  }

  // Use existing parseSource for the heavy lifting
  return parseSource(trimmed).pipe(
    Effect.map((parsed) => {
      const src = parsed.source;
      // Only handle github/gitlab types (bitbucket/azure not yet implemented in parser)
      if (src.source !== "github" && src.source !== "gitlab") {
        return [];
      }

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
    }),
    // On parse error, return empty array (not a match for this resolver)
    Effect.catchAll(() => Effect.succeed([])),
  );
};
