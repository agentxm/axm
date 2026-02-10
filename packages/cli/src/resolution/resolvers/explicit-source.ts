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
import { determineSourceInput } from "../../sources/index.js";
import type { ExtensionRef } from "../types.js";
import { buildOriginUrl } from "./url-utils.js";

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
export const resolveExplicitSource = (input: string) => {
  const trimmed = input.trim();

  // Return empty array if input doesn't start with a known prefix
  if (!hasKnownPrefix(trimmed)) {
    return Effect.succeed([]);
  }

  // Return empty array for future prefixes not yet implemented in parser
  if (!hasSupportedPrefix(trimmed)) {
    return Effect.succeed([]);
  }

  // Use existing determineSourceInput for the heavy lifting
  return determineSourceInput(trimmed).pipe(
    Effect.map((src) => {
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
