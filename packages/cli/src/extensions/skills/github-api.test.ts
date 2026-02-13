/**
 * Unit tests for github-api module.
 *
 * Tests GitHub API operations for fetching repository metadata.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CliError } from "../../cli-error/index.js";
import { fetchGitHubTreeHash } from "../../sources/index.js";

describe("github-api", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Helper to mock fetch with a successful response
   */
  const mockFetchSuccess = (data: unknown, status = 200): void => {
    const mockFn = vi.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
      }),
    );
    global.fetch = mockFn as unknown as typeof fetch;
  };

  /**
   * Helper to mock fetch with an error response
   */
  const mockFetchError = (status: number, body: string): void => {
    const mockFn = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({ message: body }),
        text: () => Promise.resolve(body),
      }),
    );
    global.fetch = mockFn as unknown as typeof fetch;
  };

  /**
   * Helper to mock fetch network failure
   */
  const mockFetchNetworkError = (error: Error): void => {
    const mockFn = vi.fn(() => Promise.reject(error));
    global.fetch = mockFn as unknown as typeof fetch;
  };

  describe("fetchGitHubTreeHash", () => {
    const sampleTreeResponse = {
      sha: "abc123rootsha",
      url: "https://api.github.com/repos/owner/repo/git/trees/abc123rootsha",
      tree: [
        { path: "README.md", mode: "100644", type: "blob" as const, sha: "readme-sha" },
        { path: "src", mode: "040000", type: "tree" as const, sha: "src-tree-sha" },
        { path: "src/index.ts", mode: "100644", type: "blob" as const, sha: "index-sha" },
        { path: "docs", mode: "040000", type: "tree" as const, sha: "docs-tree-sha" },
        { path: "docs/guide", mode: "040000", type: "tree" as const, sha: "guide-tree-sha" },
      ],
      truncated: false,
    };

    describe("success cases", () => {
      it.effect("returns root tree SHA for empty path", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "");

          expect(result).toBe("abc123rootsha");
          expect(global.fetch).toHaveBeenCalledWith(
            "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
            expect.objectContaining({
              headers: expect.objectContaining({
                Accept: "application/vnd.github+json",
              }),
            }),
          );
        }),
      );

      it.effect("returns root tree SHA for '.' path", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "v1.0.0", ".");

          expect(result).toBe("abc123rootsha");
        }),
      );

      it.effect("returns tree SHA for subdirectory path", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "src");

          expect(result).toBe("src-tree-sha");
        }),
      );

      it.effect("returns tree SHA for nested subdirectory path", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "docs/guide");

          expect(result).toBe("guide-tree-sha");
        }),
      );

      it.effect("normalizes path with leading slash", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "/src");

          expect(result).toBe("src-tree-sha");
        }),
      );

      it.effect("normalizes path with trailing slash", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "src/");

          expect(result).toBe("src-tree-sha");
        }),
      );

      it.effect("encodes special characters in URL", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          yield* fetchGitHubTreeHash("owner-name", "repo-name", "feature/test", "src");

          expect(global.fetch).toHaveBeenCalledWith(
            "https://api.github.com/repos/owner-name/repo-name/git/trees/feature%2Ftest?recursive=1",
            expect.any(Object),
          );
        }),
      );
    });

    describe("not-found cases", () => {
      it.effect("returns null when repository/ref not found (404)", () =>
        Effect.gen(function* () {
          mockFetchError(404, "Not Found");

          const result = yield* fetchGitHubTreeHash("owner", "nonexistent", "main", "");

          expect(result).toBe(null);
        }),
      );

      it.effect("returns null when path not found in tree", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "nonexistent");

          expect(result).toBe(null);
        }),
      );

      it.effect("returns null when path exists but is a blob, not tree", () =>
        Effect.gen(function* () {
          mockFetchSuccess(sampleTreeResponse);

          const result = yield* fetchGitHubTreeHash("owner", "repo", "main", "README.md");

          expect(result).toBe(null);
        }),
      );
    });

    describe("API error cases", () => {
      it.effect("fails with CliError on rate limit (403)", () =>
        Effect.gen(function* () {
          mockFetchError(403, "API rate limit exceeded");

          const error = yield* fetchGitHubTreeHash("owner", "repo", "main", "").pipe(Effect.flip);

          expect(error).toBeInstanceOf(CliError);
          expect(error._tag).toBe("CliError");
          expect(error.code).toBe("GITHUB_API_FAILED");
          expect(error.what).toContain("403");
        }),
      );

      it.effect("fails with CliError on server error (500)", () =>
        Effect.gen(function* () {
          mockFetchError(500, "Internal Server Error");

          const error = yield* fetchGitHubTreeHash("owner", "repo", "main", "").pipe(Effect.flip);

          expect(error).toBeInstanceOf(CliError);
          expect(error.code).toBe("GITHUB_API_FAILED");
          expect(error.what).toContain("500");
        }),
      );

      it.effect("fails with CliError on network failure", () =>
        Effect.gen(function* () {
          mockFetchNetworkError(new Error("Network request failed"));

          const error = yield* fetchGitHubTreeHash("owner", "repo", "main", "").pipe(Effect.flip);

          expect(error).toBeInstanceOf(CliError);
          expect(error.what).toContain("Network request failed");
        }),
      );

      it.effect("fails with CliError on invalid JSON response", () =>
        Effect.gen(function* () {
          const mockFn = vi.fn(() =>
            Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.reject(new Error("Invalid JSON")),
              text: () => Promise.resolve("not json"),
            }),
          );
          global.fetch = mockFn as unknown as typeof fetch;

          const error = yield* fetchGitHubTreeHash("owner", "repo", "main", "").pipe(Effect.flip);

          expect(error).toBeInstanceOf(CliError);
          expect(error.what).toContain("parse");
        }),
      );
    });
  });
});
