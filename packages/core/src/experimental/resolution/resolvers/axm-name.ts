/**
 * AXM name resolver.
 *
 * Resolves fully qualified AXM names like `@scope/name` or `@scope/name@^1.0.0`.
 * Checks project level first, then global level, then registry (placeholder).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import type { ExtensionRef, ResolutionOptions } from "../types.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Pattern for AXM names: @scope/name optionally with @version
 * Captures: [1] = scope (with @), [2] = name, [3] = version (optional)
 */
const AXM_NAME_PATTERN = /^(@[^/@]+)\/([^/@]+)(?:@(.+))?$/;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Check if an input string matches the AXM name pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isAxmName = (input: string): boolean => AXM_NAME_PATTERN.test(input);

/**
 * Expand ~ to home directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
const expandHome = (p: string): string => {
  if (p.startsWith("~/") || p === "~") {
    return nodePath.join(os.homedir(), p.slice(1));
  }
  return p;
};

/**
 * Check if a directory exists at the given path.
 *
 * @experimental This API is unstable and may change without notice.
 */
const directoryExists = (dirPath: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const stat = yield* fs.stat(dirPath).pipe(Effect.catchAll(() => Effect.succeed(null)));
    return stat !== null && stat.type === "Directory";
  });

/**
 * Build an ExtensionRef for an AXM name found at a local path.
 *
 * @experimental This API is unstable and may change without notice.
 */
const buildExtensionRef = (
  fullName: string,
  origin: string,
  originalInput: string,
  versionConstraint?: string,
): ExtensionRef => ({
  type: "skill", // Default to skill, could be detected from manifest
  source: "registry",
  origin,
  name: fullName,
  originalInput,
  metadata: {
    ...(versionConstraint ? { versionConstraint } : {}),
  },
});

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Resolve an AXM name to extension references.
 *
 * AXM names follow the pattern `@scope/name[@version]`.
 *
 * Resolution order:
 * 1. Project level: `.axm/skills/@scope/name/`
 * 2. Global level: `~/.axm/skills/@scope/name/`
 * 3. Registry lookup (placeholder - returns empty)
 *
 * Returns an empty array if:
 * - Input doesn't match `@scope/name` pattern
 * - No matching directory found at project or global level
 * - Registry lookup returns no results (placeholder behavior)
 *
 * @param input - The input string to resolve (e.g., `@scope/name` or `@scope/name@^1.0.0`)
 * @param options - Resolution options
 * @returns Effect containing array of ExtensionRef (empty if no match)
 *
 * @example
 * ```typescript
 * import { resolveAxmName } from "@agentxm/core/experimental/resolution";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect } from "effect";
 *
 * const program = resolveAxmName("@wayne/grappling-hook", {
 *   projectDir: ".axm",
 *   globalDir: "~/.axm",
 * }).pipe(Effect.provide(NodeFileSystem.layer));
 *
 * const refs = await Effect.runPromise(program);
 * // [{ type: "skill", source: "registry", origin: ".axm/skills/@wayne/grappling-hook", name: "@wayne/grappling-hook", ... }]
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveAxmName = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Check if input matches AXM name pattern
    const match = input.match(AXM_NAME_PATTERN);
    if (!match || !match[1] || !match[2]) {
      return [];
    }

    const scope = match[1]; // @scope
    const name = match[2]; // name
    const versionConstraint = match[3]; // optional version
    const fullName = `${scope}/${name}`;

    // Determine directories to check
    const projectDir = options.projectDir ?? ".axm";
    const globalDir = expandHome(options.globalDir ?? "~/.axm");
    const cwd = options.cwd ?? process.cwd();

    // Build paths to check
    const projectPath = nodePath.resolve(cwd, projectDir, "skills", scope, name);
    const globalPath = nodePath.resolve(globalDir, "skills", scope, name);

    // Step 1: Check project level
    const projectExists = yield* directoryExists(projectPath);
    if (projectExists) {
      return [buildExtensionRef(fullName, projectPath, input, versionConstraint)];
    }

    // Step 2: Check global level
    const globalExists = yield* directoryExists(globalPath);
    if (globalExists) {
      return [buildExtensionRef(fullName, globalPath, input, versionConstraint)];
    }

    // Step 3: Registry lookup (placeholder - return empty)
    // Future: Query remote registry API
    return [];
  });
