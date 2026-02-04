/**
 * Ambiguous pattern resolver for `a/b` inputs.
 *
 * Disambiguates inputs that could be AXM names or source shorthand.
 * Resolution order: AXM name -> GitHub shorthand.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FileSystem } from "@effect/platform";
import * as Effect from "effect/Effect";
import { parseSource } from "../../skills/source-parser.js";
import type { ExtensionRef, ResolutionOptions } from "../types.js";
import { resolveAxmName } from "./axm-name.js";

// -----------------------------------------------------------------------------
// Pattern Detection
// -----------------------------------------------------------------------------

/**
 * Pattern for ambiguous `a/b` inputs.
 * Matches: something/something (no prefix, no @, not a path prefix)
 *
 * @experimental This API is unstable and may change without notice.
 */
const AMBIGUOUS_PATTERN = /^[^/@.:][^/@:]*\/[^/@]+(?:\/[^@]+)?(?:@.+)?$/;

/**
 * Check if input is an ambiguous `a/b` pattern.
 *
 * Returns false if:
 * - Input has a known prefix (github:, gitlab:, etc.)
 * - Input starts with @ (scoped package)
 * - Input is a local path (./,  ../, /, C:\)
 * - Input is a URL
 *
 * @experimental This API is unstable and may change without notice.
 */
const isAmbiguousPattern = (input: string): boolean => {
  const trimmed = input.trim();

  // Skip if empty
  if (!trimmed) return false;

  // Skip if has known prefix
  if (/^(github|gitlab|bitbucket|azure):/.test(trimmed)) return false;

  // Skip if starts with @ (scoped package name)
  if (trimmed.startsWith("@")) return false;

  // Skip if looks like a local path
  if (/^(\.\.?\/|\/|~[/\\]|[A-Za-z]:[\\/])/.test(trimmed)) return false;

  // Skip if looks like a URL
  if (/^https?:\/\//.test(trimmed)) return false;

  // Skip if looks like SSH URL
  if (/^git@/.test(trimmed)) return false;

  // Must match the ambiguous pattern
  return AMBIGUOUS_PATTERN.test(trimmed);
};

// -----------------------------------------------------------------------------
// Helper: Build Origin URL
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Sub-Resolvers
// -----------------------------------------------------------------------------

/**
 * Try to resolve as AXM scoped name by prepending @.
 *
 * Converts `scope/name` to `@scope/name` and delegates to resolveAxmName.
 *
 * @experimental This API is unstable and may change without notice.
 */
const tryAxmName = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> => {
  // Extract scope and name from input (a/b -> @a/b)
  const match = input.match(/^([^/@]+)\/([^/@]+)(?:@(.+))?$/);
  if (!match || !match[1] || !match[2]) {
    return Effect.succeed([]);
  }

  const scope = match[1];
  const name = match[2];
  const version = match[3];

  // Build AXM name: @scope/name[@version]
  const axmName = version ? `@${scope}/${name}@${version}` : `@${scope}/${name}`;

  return resolveAxmName(axmName, options);
};

/**
 * Resolve via GitHub shorthand using source-parser.
 *
 * @experimental This API is unstable and may change without notice.
 */
const trySourceParser = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never> => {
  return parseSource(input).pipe(
    Effect.map((parsed) => {
      // Only handle github/gitlab types
      if (parsed.type !== "github" && parsed.type !== "gitlab") {
        return [];
      }

      // Check source filter if provided
      if (options.sources && !options.sources.includes(parsed.type)) {
        return [];
      }

      // Ensure we have owner and repo
      if (!parsed.owner || !parsed.repo) {
        return [];
      }

      const ref: ExtensionRef = {
        type: "skill",
        source: parsed.type,
        origin: buildOriginUrl(parsed.type, parsed.owner, parsed.repo),
        originalInput: input,
        metadata: {},
        ...(parsed.ref && { ref: parsed.ref }),
        ...(parsed.path && { path: parsed.path }),
      };

      return [ref];
    }),
    Effect.catchAll(() => Effect.succeed([])),
  );
};

// -----------------------------------------------------------------------------
// Main Resolver
// -----------------------------------------------------------------------------

/**
 * Resolve ambiguous `a/b` patterns that could be AXM names or source shorthand.
 *
 * Resolution order (early exit on first non-empty result):
 * 1. Check if `@a/b` exists as an AXM name (treat first segment as scope)
 * 2. Fall back to GitHub shorthand via source-parser
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve (expected format: `a/b`)
 * @param options - Resolution options
 * @returns Effect containing array of ExtensionRefs, or empty array if not a match
 *
 * @example
 * ```typescript
 * import { resolveAmbiguous } from "@agentxm/core/experimental/resolution";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect } from "effect";
 *
 * const program = resolveAmbiguous("owner/repo", { cwd: "/home/user" }).pipe(
 *   Effect.provide(NodeFileSystem.layer),
 * );
 *
 * // If @owner/repo exists in AXM -> returns registry ExtensionRef
 * // Else -> returns GitHub ExtensionRef for owner/repo
 * const refs = await Effect.runPromise(program);
 * ```
 */
export const resolveAmbiguous = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> => {
  const trimmed = input.trim();

  // Return empty array if input doesn't match ambiguous pattern
  if (!isAmbiguousPattern(trimmed)) {
    return Effect.succeed([]);
  }

  // Check source filter
  const allowRegistry = !options.sources || options.sources.includes("registry");
  const allowGitSources =
    !options.sources || options.sources.some((s) => ["github", "gitlab"].includes(s));

  // Try resolution in order with early exit
  return Effect.gen(function* () {
    // 1. Try AXM name (if not filtered out)
    if (allowRegistry) {
      const axmResults = yield* tryAxmName(trimmed, options);
      if (axmResults.length > 0) {
        return axmResults;
      }
    }

    // 2. Fall back to GitHub shorthand (if not filtered out)
    if (allowGitSources) {
      const gitResults = yield* trySourceParser(trimmed, options);
      if (gitResults.length > 0) {
        return gitResults;
      }
    }

    // No matches found
    return [];
  });
};
