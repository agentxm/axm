/**
 * Folder hash computation for lockfile integrity.
 *
 * Computes a deterministic hash for a directory:
 * - Git tree SHA for directories within a git repository
 * - SHA-256 content hash fallback for non-git directories
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";

import { computeContentHash, type HashError } from "./content-hash.js";
import { type GitError, getTreeSha, isGitRepository } from "./git.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Source of the folder hash.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FolderHashSource = "git-tree" | "content-hash";

/**
 * Result of computing a folder hash.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FolderHashResult {
  /** The computed hash value */
  readonly hash: string;
  /** How the hash was computed */
  readonly source: FolderHashSource;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Computes a folder hash for lockfile integrity tracking.
 *
 * For git repositories: Uses the git tree SHA of the directory, which is
 * stable across rebases that don't change content.
 *
 * For non-git directories: Falls back to SHA-256 content hash of all files.
 *
 * @param directory - The directory to hash
 * @param repoRoot - Optional git repository root (if known). When provided,
 *                   the tree SHA is computed relative to this root.
 * @returns Effect yielding the hash result with source information
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { computeFolderHash } from "@agentxm/core/experimental/skills";
 * import { Effect } from "effect";
 * import { NodeContext } from "@effect/platform-node";
 *
 * const program = Effect.gen(function* () {
 *   // Git repo - uses tree SHA
 *   const gitResult = yield* computeFolderHash("./my-git-skill");
 *   console.log(gitResult); // { hash: "abc123...", source: "git-tree" }
 *
 *   // Non-git - uses content hash
 *   const localResult = yield* computeFolderHash("/tmp/local-skill");
 *   console.log(localResult); // { hash: "sha256:def456...", source: "content-hash" }
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)));
 * ```
 */
export const computeFolderHash = (
  directory: string,
  repoRoot?: string,
): Effect.Effect<FolderHashResult, HashError | GitError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Check if directory is in a git repository
    const inGitRepo = yield* isGitRepository(directory);

    if (inGitRepo) {
      // Compute git tree SHA
      // If repoRoot is provided, compute relative path; otherwise use "."
      const subPath = repoRoot ? nodePath.relative(repoRoot, directory) || "." : ".";
      const effectiveRoot = repoRoot ?? directory;

      const treeSha = yield* getTreeSha(effectiveRoot, subPath);
      return {
        hash: treeSha,
        source: "git-tree" as FolderHashSource,
      };
    }

    // Fall back to content hash for non-git directories
    const contentHash = yield* computeContentHash(directory);
    return {
      hash: contentHash,
      source: "content-hash" as FolderHashSource,
    };
  });
