/**
 * Unit tests for git module.
 *
 * Tests git operations for cloning repositories at specific refs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { getTreeSha } from "./operations.js";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

describe("git", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a local git repository for testing
   */
  const createLocalRepo = async (repoPath: string): Promise<void> => {
    fs.mkdirSync(repoPath, { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: repoPath, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: repoPath, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "pipe" });
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Test Repo");
    execSync("git add .", { cwd: repoPath, stdio: "pipe" });
    execSync("git commit -m 'Initial commit'", { cwd: repoPath, stdio: "pipe" });
  };

  describe("getTreeSha", () => {
    it.effect("returns tree SHA for repository root", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const treeSha = yield* getTreeSha(repoPath);

        // Tree SHA is a 40-character hex string
        expect(treeSha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("returns different tree SHA for different content", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const treeSha1 = yield* getTreeSha(repoPath);

        // Add a new file and commit
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        fs.writeFileSync(path.join(repoPath, "new-file.md"), "# New File");
        execSync("git add .", { cwd: repoPath, stdio: "pipe" });
        execSync("git commit -m 'Add new file'", { cwd: repoPath, stdio: "pipe" });

        const treeSha2 = yield* getTreeSha(repoPath);

        expect(treeSha1).not.toBe(treeSha2);
        expect(treeSha2).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("returns tree SHA for subdirectory", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        // Create a subdirectory with content
        const subDir = path.join(repoPath, "subdir");
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, "file.txt"), "content");
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        execSync("git add .", { cwd: repoPath, stdio: "pipe" });
        execSync("git commit -m 'Add subdir'", { cwd: repoPath, stdio: "pipe" });

        const treeSha = yield* getTreeSha(repoPath, "subdir");

        expect(treeSha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("fails with AppError for non-existent path", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const error = yield* getTreeSha(repoPath, "non-existent").pipe(Effect.flip);

        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("GIT_GET_TREE_SHA_FAILED");
      }),
    );

    it.effect("fails with AppError for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* getTreeSha(nonGitPath).pipe(Effect.flip);

        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("GIT_GET_TREE_SHA_FAILED");
      }),
    );
  });

  describe("AppError", () => {
    it("is a tagged error with correct tag", () => {
      const error = makeAppError({
        code: "GIT_CLONE_FAILED",
        what: "Failed to clone repository",
      });

      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("GIT_CLONE_FAILED");
      expect(error.what).toBe("Failed to clone repository");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = makeAppError({
        code: "GIT_CLONE_FAILED",
        what: "Failed to clone repository",
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });
});
