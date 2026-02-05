/**
 * GitHub API operations for fetching repository metadata.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error type for GitHub API operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class GitHubApiError extends Data.TaggedError("GitHubApiError")<{
  /** HTTP status code (if applicable) */
  readonly status: Option.Option<number>;
  /** Human-readable error message */
  readonly message: string;
  /** Original error cause */
  readonly cause: Option.Option<unknown>;
}> {}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Tree entry from GitHub Trees API response.
 */
interface GitHubTreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: "blob" | "tree";
  readonly sha: string;
  readonly size: Option.Option<number>;
}

/**
 * GitHub Trees API response structure.
 */
interface GitHubTreeResponse {
  readonly sha: string;
  readonly url: string;
  readonly tree: ReadonlyArray<GitHubTreeEntry>;
  readonly truncated: boolean;
}

// -----------------------------------------------------------------------------
// GitHub API Operations
// -----------------------------------------------------------------------------

/**
 * Fetch the tree SHA for a path within a GitHub repository.
 *
 * Uses the GitHub Trees API to fetch the tree SHA without cloning the repository.
 * Returns null if the path does not exist in the repository.
 *
 * @param owner - Repository owner (user or organization)
 * @param repo - Repository name
 * @param ref - Git ref (branch, tag, or commit SHA)
 * @param path - Path within the repository (empty string or "." for root)
 * @returns Effect that resolves to the tree SHA, null if path not found, or fails with GitHubApiError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fetchGitHubTreeHash = (
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Effect.Effect<string | null, GitHubApiError> =>
  Effect.gen(function* () {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }),
      catch: (error) =>
        new GitHubApiError({
          status: Option.none(),
          message: `Failed to fetch GitHub tree: ${error instanceof Error ? error.message : String(error)}`,
          cause: Option.some(error),
        }),
    });

    // Handle HTTP errors
    if (!response.ok) {
      if (response.status === 404) {
        // Repository or ref not found - return null
        return null;
      }
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new GitHubApiError({
            status: Option.some(response.status),
            message: `GitHub API returned ${response.status}`,
            cause: Option.none(),
          }),
      });
      return yield* new GitHubApiError({
        status: Option.some(response.status),
        message: `GitHub API returned ${response.status}: ${body}`,
        cause: Option.none(),
      });
    }

    // Parse JSON response
    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<GitHubTreeResponse>,
      catch: (error) =>
        new GitHubApiError({
          status: Option.none(),
          message: `Failed to parse GitHub API response: ${error instanceof Error ? error.message : String(error)}`,
          cause: Option.some(error),
        }),
    });

    // Normalize the path (remove leading/trailing slashes, handle "." and "")
    const normalizedPath = path === "." || path === "" ? "" : path.replace(/^\/+|\/+$/g, "");

    // For root path, return the root tree SHA
    if (normalizedPath === "") {
      return data.sha;
    }

    // Find the tree entry matching the path
    const entry = data.tree.find((e) => e.path === normalizedPath && e.type === "tree");

    if (!entry) {
      // Path not found in tree
      return null;
    }

    return entry.sha;
  });
