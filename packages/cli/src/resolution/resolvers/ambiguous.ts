/**
 * Ambiguous pattern resolver for `a/b` inputs.
 *
 * Disambiguates inputs that could be AXM names or source shorthand.
 * Resolution order: AXM name -> Git hosting sources in workspace order.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FileSystem } from "@effect/platform";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SourceConfig } from "../../settings/index.js";
import { Workspace } from "../../workspace/index.js";
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
 * Build probe URL from source config and owner/repo pattern.
 * Returns None for sources that don't support owner/repo pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
const buildProbeUrl = (
  source: SourceConfig,
  owner: string,
  repo: string,
): Option.Option<string> => {
  if (source.type === "github" || source.type === "gitlab" || source.type === "bitbucket") {
    return Option.some(`${source.url.origin}/${owner}/${repo}`);
  }
  // Azure Repos uses different URL format, registry/local don't apply
  return Option.none();
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
 * Resolve via git hosting sources from workspace configuration.
 * Tries sources in order, first successful probe wins.
 *
 * @experimental This API is unstable and may change without notice.
 */
const tryGitSources = (input: string, options: ResolutionOptions) => {
  // Extract owner/repo from input
  const match = input.match(/^([^/@]+)\/([^/@]+)(?:@(.+))?$/);
  if (!match || !match[1] || !match[2]) {
    return Effect.succeed([]);
  }

  const owner = match[1];
  const repo = match[2];
  const version = match[3];

  return Effect.gen(function* () {
    const workspace = yield* Workspace;
    const allSources = yield* workspace.getConfiguredSources();

    // Filter to git-hosting sources
    const gitSources = allSources.filter(
      (s): s is Extract<SourceConfig, { type: "github" | "gitlab" | "bitbucket" }> =>
        s.type === "github" || s.type === "gitlab" || s.type === "bitbucket",
    );

    // Apply source filter if provided
    const sourcesFilter = Option.getOrUndefined(options.sources);
    const filteredSources = sourcesFilter
      ? gitSources.filter((s) => sourcesFilter.includes(s.type))
      : gitSources;

    // Try each source in order
    for (const source of filteredSources) {
      const probeUrl = buildProbeUrl(source, owner, repo);
      if (Option.isNone(probeUrl)) continue;

      // Probe with HEAD request
      const probeResult = yield* Effect.tryPromise({
        try: () => fetch(probeUrl.value, { method: "HEAD" }),
        catch: () => null, // Network error - continue to next source
      });

      if (probeResult && probeResult.ok) {
        // Found it! Build ExtensionRef
        const ref: ExtensionRef = {
          type: "skill",
          source: source.type,
          origin: probeUrl.value,
          originalInput: input,
          name: Option.none(),
          ref: Option.none(),
          path: Option.none(),
          metadata: {
            version: Option.none(),
            description: Option.none(),
            files: Option.none(),
            versionConstraint: Option.fromNullable(version),
          },
        };
        return [ref];
      }
    }

    // No sources succeeded
    return [];
  }).pipe(Effect.catchAll(() => Effect.succeed([])));
};

// -----------------------------------------------------------------------------
// Main Resolver
// -----------------------------------------------------------------------------

/**
 * Resolve ambiguous `a/b` patterns that could be AXM names or source shorthand.
 *
 * Resolution order (early exit on first non-empty result):
 * 1. Check if `@a/b` exists as an AXM name (treat first segment as scope)
 * 2. Fall back to git hosting sources in workspace order (github, gitlab, bitbucket)
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve (expected format: `a/b`)
 * @param options - Resolution options
 * @returns Effect containing array of ExtensionRefs, or empty array if not a match
 *
 * @example
 * ```typescript
 * import { resolveAmbiguous } from "../../resolution/index.js";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect } from "effect";
 *
 * const program = resolveAmbiguous("owner/repo", { cwd: "/home/user" }).pipe(
 *   Effect.provide(NodeFileSystem.layer),
 * );
 *
 * // If @owner/repo exists in AXM -> returns registry ExtensionRef
 * // Else -> returns ExtensionRef from first git source that responds 200
 * const refs = await Effect.runPromise(program);
 * ```
 */
export const resolveAmbiguous = (input: string, options: ResolutionOptions) => {
  const trimmed = input.trim();

  // Return empty array if input doesn't match ambiguous pattern
  if (!isAmbiguousPattern(trimmed)) {
    return Effect.succeed([]);
  }

  // Check source filter
  const sources = Option.getOrUndefined(options.sources);
  const allowRegistry = !sources || sources.includes("registry");
  const allowGitSources =
    !sources || sources.some((s) => ["github", "gitlab", "bitbucket"].includes(s));

  // Try resolution in order with early exit
  return Effect.gen(function* () {
    // 1. Try AXM name (if not filtered out)
    if (allowRegistry) {
      const axmResults = yield* tryAxmName(trimmed, options);
      if (axmResults.length > 0) {
        return axmResults;
      }
    }

    // 2. Fall back to git hosting sources (if not filtered out)
    if (allowGitSources) {
      const gitResults = yield* tryGitSources(trimmed, options);
      if (gitResults.length > 0) {
        return gitResults;
      }
    }

    // No matches found
    return [];
  }).pipe(Effect.withSpan("Resolution.resolveAmbiguous"));
};
