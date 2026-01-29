/**
 * Unit tests for git module.
 *
 * Tests git operations for cloning repositories at specific refs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneRepo, GitError, getCurrentCommit, resolveRef } from "../git.js";

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
   * Helper to run an Effect
   */
  const runEffect = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

  /**
   * Helper to run an Effect and expect it to fail
   */
  const runEffectEither = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(Effect.either(effect));

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
    it("clones a local repository", async () => {
      const sourceRepo = path.join(tempDir, "source");
      const destRepo = path.join(tempDir, "dest");
      await createLocalRepo(sourceRepo);

      await runEffect(cloneRepo(sourceRepo, destRepo));

      // Verify the clone exists and has git metadata
      expect(fs.existsSync(path.join(destRepo, ".git"))).toBe(true);
      expect(fs.existsSync(path.join(destRepo, "README.md"))).toBe(true);
    });

    it("checks out a specific ref after clone", async () => {
      const sourceRepo = path.join(tempDir, "source");
      const destRepo = path.join(tempDir, "dest");
      await createLocalRepo(sourceRepo);

      // Create a branch in the source repo
      const { execSync } = await import("node:child_process");
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
      await runEffect(cloneRepo(sourceRepo, destRepo, "test-branch"));

      // Verify we're on the branch (branch-file.md should exist)
      expect(fs.existsSync(path.join(destRepo, "branch-file.md"))).toBe(true);
    });

    it("fails with GitError for non-existent repository", async () => {
      const destRepo = path.join(tempDir, "dest");
      const nonExistentRepo = path.join(tempDir, "does-not-exist");

      const result = await runEffectEither(cloneRepo(nonExistentRepo, destRepo));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(GitError);
        expect(result.left.operation).toBe("clone");
      }
    });

    it("fails with GitError for invalid ref", async () => {
      const sourceRepo = path.join(tempDir, "source");
      const destRepo = path.join(tempDir, "dest");
      await createLocalRepo(sourceRepo);

      const result = await runEffectEither(cloneRepo(sourceRepo, destRepo, "non-existent-ref"));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(GitError);
        expect(result.left.operation).toBe("checkout");
      }
    });
  });

  describe("resolveRef", () => {
    it("resolves HEAD to a commit SHA", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);
      const expectedSha = await getHeadSha(repoPath);

      const sha = await runEffect(resolveRef(repoPath, "HEAD"));

      expect(sha).toBe(expectedSha);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it("resolves a branch name to a commit SHA", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);
      const { execSync } = await import("node:child_process");

      // Get the current branch name (main or master)
      const branchName = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
      }).trim();

      const sha = await runEffect(resolveRef(repoPath, branchName));

      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it("resolves a tag to a commit SHA", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);
      const { execSync } = await import("node:child_process");

      // Create a tag
      execSync("git tag v1.0.0", { cwd: repoPath, stdio: "pipe" });

      const sha = await runEffect(resolveRef(repoPath, "v1.0.0"));

      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it("fails with GitError for invalid ref", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);

      const result = await runEffectEither(resolveRef(repoPath, "non-existent-ref"));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(GitError);
        expect(result.left.operation).toBe("resolve-ref");
      }
    });

    it("fails with GitError for non-git directory", async () => {
      const nonGitPath = path.join(tempDir, "not-a-repo");
      fs.mkdirSync(nonGitPath, { recursive: true });

      const result = await runEffectEither(resolveRef(nonGitPath, "HEAD"));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(GitError);
        expect(result.left.operation).toBe("resolve-ref");
      }
    });
  });

  describe("getCurrentCommit", () => {
    it("returns the current HEAD commit SHA", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);
      const expectedSha = await getHeadSha(repoPath);

      const sha = await runEffect(getCurrentCommit(repoPath));

      expect(sha).toBe(expectedSha);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it("returns different SHA after a new commit", async () => {
      const repoPath = path.join(tempDir, "repo");
      await createLocalRepo(repoPath);
      const sha1 = await runEffect(getCurrentCommit(repoPath));

      // Create a new commit
      const { execSync } = await import("node:child_process");
      fs.writeFileSync(path.join(repoPath, "new-file.md"), "# New File");
      execSync("git add .", { cwd: repoPath, stdio: "pipe" });
      execSync("git commit -m 'New commit'", { cwd: repoPath, stdio: "pipe" });

      const sha2 = await runEffect(getCurrentCommit(repoPath));

      expect(sha1).not.toBe(sha2);
      expect(sha2).toMatch(/^[a-f0-9]{40}$/);
    });

    it("fails with GitError for non-git directory", async () => {
      const nonGitPath = path.join(tempDir, "not-a-repo");
      fs.mkdirSync(nonGitPath, { recursive: true });

      const result = await runEffectEither(getCurrentCommit(nonGitPath));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(GitError);
        expect(result.left.operation).toBe("get-commit");
      }
    });
  });

  describe("GitError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new GitError({
        operation: "clone",
        message: "Test error",
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
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });
});
