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
import { makeAppError } from "../app-error/index.js";

describe("git", () => {
  let tempDir: string;

  const isolatedGitEnv = (): Record<string, string | undefined> => {
    const env = { ...process.env };
    for (const name of [
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_COMMON_DIR",
      "GIT_CONFIG",
      "GIT_CONFIG_COUNT",
      "GIT_CONFIG_PARAMETERS",
      "GIT_DIR",
      "GIT_GRAFT_FILE",
      "GIT_IMPLICIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_INTERNAL_SUPER_PREFIX",
      "GIT_NO_REPLACE_OBJECTS",
      "GIT_OBJECT_DIRECTORY",
      "GIT_PREFIX",
      "GIT_REPLACE_REF_BASE",
      "GIT_SHALLOW_FILE",
      "GIT_WORK_TREE",
    ]) {
      delete env[name];
    }
    return env;
  };

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
    const gitOptions = { cwd: repoPath, env: isolatedGitEnv(), stdio: "pipe" } as const;
    execSync("git init", gitOptions);
    execSync("git config user.email 'test@test.com'", gitOptions);
    execSync("git config user.name 'Test'", gitOptions);
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Test Repo");
    execSync("git add .", gitOptions);
    execSync("git commit -m 'Initial commit'", gitOptions);
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
        const gitOptions = { cwd: repoPath, env: isolatedGitEnv(), stdio: "pipe" } as const;
        execSync("git add .", gitOptions);
        execSync("git commit -m 'Add new file'", gitOptions);

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
        const gitOptions = { cwd: repoPath, env: isolatedGitEnv(), stdio: "pipe" } as const;
        execSync("git add .", gitOptions);
        execSync("git commit -m 'Add subdir'", gitOptions);

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
        expect(error.code).toBe("validation");
      }),
    );

    it.effect("fails with AppError for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* getTreeSha(nonGitPath).pipe(Effect.flip);

        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("validation");
      }),
    );
  });

  describe("AppError", () => {
    it("is a tagged error with correct tag", () => {
      const error = makeAppError({
        code: "internal",
        detail: "Failed to clone repository",
      });

      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("internal");
      expect(error.detail).toBe("Failed to clone repository");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = makeAppError({
        code: "internal",
        detail: "Failed to clone repository",
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });
});
