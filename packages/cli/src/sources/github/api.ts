/**
 * GitHub API operations for fetching repository metadata.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError, type CliError } from "../../cli-error/index.js";

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
 * @returns Effect that resolves to the tree SHA, null if path not found, or fails with CliError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fetchGitHubTreeHash = (
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Effect.Effect<string | null, CliError> =>
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
        makeCliError({
          code: "GITHUB_API_FAILED",
          what: `Failed to fetch GitHub tree: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
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
          makeCliError({
            code: "GITHUB_API_FAILED",
            what: `GitHub API returned ${response.status}`,
          }),
      });
      return yield* makeCliError({
        code: "GITHUB_API_FAILED",
        what: `GitHub API returned ${response.status}: ${body}`,
      });
    }

    // Parse JSON response
    const data = yield* Effect.tryPromise({
      // Assertion needed: GitHub Trees API response shape is stable and well-known;
      // full Schema validation would require defining schemas for the entire Trees API
      try: () => response.json() as Promise<GitHubTreeResponse>,
      catch: (error) =>
        makeCliError({
          code: "GITHUB_API_FAILED",
          what: `Failed to parse GitHub API response: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    // Normalize the path (remove leading/trailing slashes, handle "." and "")
    const normalizedPath = path === "." || path === "" ? "" : path.replace(/^\/+|\/+$/g, "");

    // For root path, return the root tree SHA
    if (normalizedPath === "") {
      return data.sha;
    }

    // Find the tree entry matching the path
    return Option.match(
      Array.findFirst(data.tree, (e) => e.path === normalizedPath && e.type === "tree"),
      {
        onNone: () => null,
        onSome: (entry) => entry.sha,
      },
    );
  });
