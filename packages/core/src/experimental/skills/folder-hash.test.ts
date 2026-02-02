/**
 * Unit tests for folder-hash module.
 *
 * Tests folder hash computation with git tree SHA and content hash fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { computeFolderHash } from "./folder-hash.js";

describe("folder-hash", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "folder-hash-test-"));
  });

  afterEach(() => {
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

  describe("computeFolderHash", () => {
    it.effect("returns git-tree source for git repository", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const result = yield* computeFolderHash(repoPath);

        expect(result.source).toBe("git-tree");
        expect(result.hash).toMatch(/^[a-f0-9]{40}$/);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns content-hash source for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "non-git");
        fs.mkdirSync(nonGitPath, { recursive: true });
        fs.writeFileSync(path.join(nonGitPath, "file.txt"), "content");

        const result = yield* computeFolderHash(nonGitPath);

        expect(result.source).toBe("content-hash");
        expect(result.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns stable hash for same git content", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const result1 = yield* computeFolderHash(repoPath);
        const result2 = yield* computeFolderHash(repoPath);

        expect(result1.hash).toBe(result2.hash);
        expect(result1.source).toBe(result2.source);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns different hash after git content changes", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const result1 = yield* computeFolderHash(repoPath);

        // Modify content and commit
        fs.writeFileSync(path.join(repoPath, "new-file.md"), "# New");
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        execSync("git add .", { cwd: repoPath, stdio: "pipe" });
        execSync("git commit -m 'Add new file'", { cwd: repoPath, stdio: "pipe" });

        const result2 = yield* computeFolderHash(repoPath);

        expect(result1.hash).not.toBe(result2.hash);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns stable content hash for same non-git content", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "non-git");
        fs.mkdirSync(nonGitPath, { recursive: true });
        fs.writeFileSync(path.join(nonGitPath, "file.txt"), "content");

        const result1 = yield* computeFolderHash(nonGitPath);
        const result2 = yield* computeFolderHash(nonGitPath);

        expect(result1.hash).toBe(result2.hash);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("returns different content hash after non-git content changes", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "non-git");
        fs.mkdirSync(nonGitPath, { recursive: true });
        fs.writeFileSync(path.join(nonGitPath, "file.txt"), "content1");

        const result1 = yield* computeFolderHash(nonGitPath);

        fs.writeFileSync(path.join(nonGitPath, "file.txt"), "content2");

        const result2 = yield* computeFolderHash(nonGitPath);

        expect(result1.hash).not.toBe(result2.hash);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("computes hash for subdirectory in git repo using repoRoot", () =>
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

        const result = yield* computeFolderHash(subDir, repoPath);

        expect(result.source).toBe("git-tree");
        expect(result.hash).toMatch(/^[a-f0-9]{40}$/);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.effect("subdirectory hash differs from root hash", () =>
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

        const rootResult = yield* computeFolderHash(repoPath);
        const subDirResult = yield* computeFolderHash(subDir, repoPath);

        expect(rootResult.hash).not.toBe(subDirResult.hash);
      }).pipe(Effect.provide(NodeContext.layer)),
    );
  });
});
