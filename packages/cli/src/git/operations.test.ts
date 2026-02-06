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
import * as Option from "effect/Option";
import {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "./operations.js";
import { GitError } from "./errors.js";

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

  /**
   * Helper to get the HEAD commit SHA from a repo
   */
  const getHeadSha = async (repoPath: string): Promise<string> => {
    const { execSync } = await import("node:child_process");
    return execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  };

  describe("cloneRepo", () => {
    it.effect("clones a local repository", () =>
      Effect.gen(function* () {
        const sourceRepo = path.join(tempDir, "source");
        const destRepo = path.join(tempDir, "dest");
        yield* Effect.promise(() => createLocalRepo(sourceRepo));

        yield* cloneRepo(sourceRepo, destRepo);

        // Verify the clone exists and has git metadata
        expect(fs.existsSync(path.join(destRepo, ".git"))).toBe(true);
        expect(fs.existsSync(path.join(destRepo, "README.md"))).toBe(true);
      }),
    );

    it.effect("checks out a specific ref after clone", () =>
      Effect.gen(function* () {
        const sourceRepo = path.join(tempDir, "source");
        const destRepo = path.join(tempDir, "dest");
        yield* Effect.promise(() => createLocalRepo(sourceRepo));

        // Create a branch in the source repo
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        execSync("git checkout -b test-branch", { cwd: sourceRepo, stdio: "pipe" });
        fs.writeFileSync(path.join(sourceRepo, "branch-file.md"), "# Branch File");
        execSync("git add .", { cwd: sourceRepo, stdio: "pipe" });
        execSync("git commit -m 'Branch commit'", { cwd: sourceRepo, stdio: "pipe" });
        execSync("git checkout main || git checkout master", {
          cwd: sourceRepo,
          stdio: "pipe",
          shell: "/bin/bash",
        });

        // Clone and checkout the branch
        yield* cloneRepo(sourceRepo, destRepo, "test-branch");

        // Verify we're on the branch (branch-file.md should exist)
        expect(fs.existsSync(path.join(destRepo, "branch-file.md"))).toBe(true);
      }),
    );

    it.effect("fails with GitError for non-existent repository", () =>
      Effect.gen(function* () {
        const destRepo = path.join(tempDir, "dest");
        const nonExistentRepo = path.join(tempDir, "does-not-exist");

        const error = yield* cloneRepo(nonExistentRepo, destRepo).pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("clone");
      }),
    );

    it.effect("fails with GitError for invalid ref", () =>
      Effect.gen(function* () {
        const sourceRepo = path.join(tempDir, "source");
        const destRepo = path.join(tempDir, "dest");
        yield* Effect.promise(() => createLocalRepo(sourceRepo));

        const error = yield* cloneRepo(sourceRepo, destRepo, "non-existent-ref").pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("checkout");
      }),
    );
  });

  describe("resolveRef", () => {
    it.effect("resolves HEAD to a commit SHA", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const expectedSha = yield* Effect.promise(() => getHeadSha(repoPath));

        const sha = yield* resolveRef(repoPath, "HEAD");

        expect(sha).toBe(expectedSha);
        expect(sha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("resolves a branch name to a commit SHA", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));

        // Get the current branch name (main or master)
        const branchName = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoPath,
          encoding: "utf-8",
        }).trim();

        const sha = yield* resolveRef(repoPath, branchName);

        expect(sha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("resolves a tag to a commit SHA", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));

        // Create a tag
        execSync("git tag v1.0.0", { cwd: repoPath, stdio: "pipe" });

        const sha = yield* resolveRef(repoPath, "v1.0.0");

        expect(sha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("resolves a full SHA to itself", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const expectedSha = yield* Effect.promise(() => getHeadSha(repoPath));

        const sha = yield* resolveRef(repoPath, expectedSha);

        expect(sha).toBe(expectedSha);
      }),
    );

    it.effect("resolves a short SHA to a full SHA", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const expectedSha = yield* Effect.promise(() => getHeadSha(repoPath));
        const shortSha = expectedSha.substring(0, 7);

        const sha = yield* resolveRef(repoPath, shortSha);

        expect(sha).toBe(expectedSha);
        expect(sha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("fails with GitError for invalid ref", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const error = yield* resolveRef(repoPath, "non-existent-ref").pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("resolve-ref");
      }),
    );

    it.effect("fails with GitError for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* resolveRef(nonGitPath, "HEAD").pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("resolve-ref");
      }),
    );
  });

  describe("getCurrentCommit", () => {
    it.effect("returns the current HEAD commit SHA", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const expectedSha = yield* Effect.promise(() => getHeadSha(repoPath));

        const sha = yield* getCurrentCommit(repoPath);

        expect(sha).toBe(expectedSha);
        expect(sha).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("returns different SHA after a new commit", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const sha1 = yield* getCurrentCommit(repoPath);

        // Create a new commit
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        fs.writeFileSync(path.join(repoPath, "new-file.md"), "# New File");
        execSync("git add .", { cwd: repoPath, stdio: "pipe" });
        execSync("git commit -m 'New commit'", { cwd: repoPath, stdio: "pipe" });

        const sha2 = yield* getCurrentCommit(repoPath);

        expect(sha1).not.toBe(sha2);
        expect(sha2).toMatch(/^[a-f0-9]{40}$/);
      }),
    );

    it.effect("fails with GitError for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* getCurrentCommit(nonGitPath).pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("get-commit");
      }),
    );
  });

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

    it.effect("fails with GitError for non-existent path", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const error = yield* getTreeSha(repoPath, "non-existent").pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("get-tree-sha");
      }),
    );

    it.effect("fails with GitError for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* getTreeSha(nonGitPath).pipe(Effect.flip);

        expect(error).toBeInstanceOf(GitError);
        expect(error.operation).toBe("get-tree-sha");
      }),
    );
  });

  describe("isGitRepository", () => {
    it.effect("returns true for a git repository", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const result = yield* isGitRepository(repoPath);

        expect(result).toBe(true);
      }),
    );

    it.effect("returns true for a subdirectory within a git repository", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const subDir = path.join(repoPath, "subdir");
        fs.mkdirSync(subDir);

        const result = yield* isGitRepository(subDir);

        expect(result).toBe(true);
      }),
    );

    it.effect("returns false for a non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const result = yield* isGitRepository(nonGitPath);

        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for a non-existent directory", () =>
      Effect.gen(function* () {
        const nonExistentPath = path.join(tempDir, "does-not-exist");

        const result = yield* isGitRepository(nonExistentPath);

        expect(result).toBe(false);
      }),
    );
  });

  describe("GitError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new GitError({
        operation: "clone",
        message: "Test error",
        cause: Option.none(),
      });

      expect(error._tag).toBe("GitError");
      expect(error.operation).toBe("clone");
      expect(error.message).toBe("Test error");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new GitError({
        operation: "clone",
        message: "Test error",
        cause: Option.some(cause),
      });

      expect(Option.getOrNull(error.cause)).toBe(cause);
    });
  });
});
