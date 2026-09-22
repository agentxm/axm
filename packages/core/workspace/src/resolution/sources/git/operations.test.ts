/**
 * Unit tests for git module.
 *
 * Tests git operations for cloning repositories at specific refs.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  compareDirectoryToHead,
  getCommitSha,
  getTreeSha,
  listRemoteRefs,
  shallowFetchCommit,
} from "./operations.js";
import { GitOperationFailed } from "../errors.js";

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

  it.effect("passes inherited transport settings and noninteractive overrides to Git", () =>
    Effect.sync(() => {
      const binDir = path.join(tempDir, "bin");
      const resultPath = path.join(tempDir, "observed-env.txt");
      fs.mkdirSync(binDir);
      fs.writeFileSync(
        path.join(binDir, "git"),
        `#!/bin/sh
case "$PATH" in "$AXM_GIT_PROBE_BIN":*) path_state=ok ;; *) path_state=missing ;; esac
if [ "$HTTPS_PROXY" = "proxy-sentinel" ]; then proxy_state=ok; else proxy_state=missing; fi
if [ "$SSH_AUTH_SOCK" = "ssh-sentinel" ]; then ssh_state=ok; else ssh_state=missing; fi
if [ "$GIT_SSH_COMMAND" = "ssh-command-sentinel" ]; then ssh_command_state=ok; else ssh_command_state=missing; fi
if [ -z "$PAGER" ] && [ -z "$GIT_PAGER" ]; then pager_state=ok; else pager_state=present; fi
if [ "$GIT_TERMINAL_PROMPT" = "0" ]; then prompt_state=ok; else prompt_state=missing; fi
if [ "$GIT_LFS_SKIP_SMUDGE" = "1" ]; then lfs_state=ok; else lfs_state=missing; fi
printf '%s\\n' "$path_state" "$proxy_state" "$ssh_state" "$ssh_command_state" "$pager_state" "$prompt_state" "$lfs_state" > "$AXM_GIT_PROBE_RESULT"
printf '0000000000000000000000000000000000000000\\trefs/heads/main\\n'
`,
        { mode: 0o700 },
      );
      const program = `
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
const { listRemoteRefs } = await import(process.argv[1]);
const refs = await Effect.runPromise(listRemoteRefs("probe").pipe(Effect.provide(NodeServices.layer)));
if (!refs.branches.includes("main")) process.exitCode = 2;
`;
      const operationsUrl = new URL(
        "../../../../dist/src/resolution/sources/git/operations.js",
        import.meta.url,
      ).href;
      execFileSync(process.execPath, ["--input-type=module", "-e", program, operationsUrl], {
        cwd: process.cwd(),
        env: {
          ...isolatedGitEnv(),
          PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          HTTPS_PROXY: "proxy-sentinel",
          SSH_AUTH_SOCK: "ssh-sentinel",
          GIT_SSH_COMMAND: "ssh-command-sentinel",
          PAGER: "pager-sentinel",
          GIT_PAGER: "git-pager-sentinel",
          GIT_TERMINAL_PROMPT: "1",
          GIT_LFS_SKIP_SMUDGE: "0",
          AXM_GIT_PROBE_BIN: binDir,
          AXM_GIT_PROBE_RESULT: resultPath,
        },
        timeout: 10_000,
        stdio: "pipe",
      });

      expect(fs.readFileSync(resultPath, "utf8").trim().split("\n")).toEqual([
        "ok",
        "ok",
        "ok",
        "ok",
        "ok",
        "ok",
        "ok",
      ]);
    }),
  );

  it.effect("terminates a timed-out Git child and returns a typed failure", () =>
    Effect.sync(() => {
      const binDir = path.join(tempDir, "bin");
      const pidPath = path.join(tempDir, "git-child.pid");
      fs.mkdirSync(binDir);
      fs.writeFileSync(
        path.join(binDir, "git"),
        `#!/bin/sh
printf '%s\\n' "$$" > "$AXM_GIT_PROBE_PID"
exec sleep 30
`,
        { mode: 0o700 },
      );
      const program = `
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
const { listRemoteRefs, withGitOperationDeadline } = await import(process.argv[1]);
const failure = await Effect.runPromise(
  listRemoteRefs("probe").pipe(
    withGitOperationDeadline("list-remote-refs", Duration.seconds(1)),
    Effect.flip,
    Effect.provide(NodeServices.layer),
  ),
);
if (failure.operation !== "list-remote-refs" || !failure.detail.includes("deadline")) {
  process.exitCode = 2;
}
`;
      const operationsUrl = new URL(
        "../../../../dist/src/resolution/sources/git/operations.js",
        import.meta.url,
      ).href;
      try {
        execFileSync(process.execPath, ["--input-type=module", "-e", program, operationsUrl], {
          cwd: process.cwd(),
          env: {
            ...isolatedGitEnv(),
            PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
            AXM_GIT_PROBE_PID: pidPath,
          },
          timeout: 10_000,
          stdio: "pipe",
        });
        const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
        expect(() => process.kill(pid, 0)).toThrow();
      } finally {
        if (fs.existsSync(pidPath)) {
          const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
          try {
            process.kill(pid);
          } catch {
            // The expected terminated child has already exited.
          }
        }
      }
    }),
  );

  it.effect("interrupts a locator checkout child and removes its temporary directory", () =>
    Effect.sync(() => {
      const binDir = path.join(tempDir, "bin");
      const pidPath = path.join(tempDir, "git-child.pid");
      const checkoutPath = path.join(tempDir, "checkout-path.txt");
      fs.mkdirSync(binDir);
      fs.writeFileSync(
        path.join(binDir, "git"),
        `#!/bin/sh
printf '%s\\n' "$$" > "$AXM_GIT_PROBE_PID"
for argument do last="$argument"; done
printf '%s\\n' "$last" > "$AXM_GIT_PROBE_CHECKOUT"
exec sleep 30
`,
        { mode: 0o700 },
      );
      const program = `
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
const { makeLocatorSourceView } = await import(process.argv[1]);
const providers = {
  find: () => Effect.die("unused"),
  resolveNamedRegistry: () => Effect.die("unused"),
  fetch: () => Effect.die("unused"),
  cloneUrl: () => Option.none(),
  origin: () => "fixture",
};
const source = {
  type: "git",
  url: new URL("https://example.test/repo.git"),
  ref: Option.none(),
  subPath: Option.none(),
};
const options = { type: "skill", names: [], owner: Option.none(), versionRange: Option.none() };
await Effect.runPromise(
  Effect.scoped(Effect.gen(function* () {
    const view = yield* makeLocatorSourceView(providers, 7);
    const fiber = yield* view.find(source, options).pipe(Effect.forkChild);
    yield* Effect.promise(async () => {
      for (let attempt = 0; attempt < 500; attempt++) {
        if (fs.existsSync(process.env.AXM_GIT_PROBE_PID)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Git child did not start");
    });
    yield* Fiber.interrupt(fiber);
  })).pipe(Effect.provide(NodeServices.layer)),
);
`;
      const discoveryUrl = new URL(
        "../../../../dist/src/lifecycle/install/git-discovery.js",
        import.meta.url,
      ).href;
      try {
        execFileSync(process.execPath, ["--input-type=module", "-e", program, discoveryUrl], {
          cwd: process.cwd(),
          env: {
            ...isolatedGitEnv(),
            PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
            AXM_GIT_PROBE_PID: pidPath,
            AXM_GIT_PROBE_CHECKOUT: checkoutPath,
          },
          timeout: 10_000,
          stdio: "pipe",
        });
        const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
        const checkout = fs.readFileSync(checkoutPath, "utf8").trim();
        expect(() => process.kill(pid, 0)).toThrow();
        expect(path.dirname(checkout)).toBe(os.tmpdir());
        const checkoutName = path.basename(checkout);
        expect(checkoutName).toMatch(/^axm-source-discovery-[A-Za-z0-9-]+$/);
        expect(fs.readdirSync(os.tmpdir())).not.toContain(checkoutName);
      } finally {
        if (fs.existsSync(pidPath)) {
          const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
          try {
            process.kill(pid);
          } catch {
            // The expected terminated child has already exited.
          }
        }
      }
    }),
  );

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

    it.effect("fails with a typed git failure for non-existent path", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const error = yield* getTreeSha(repoPath, "non-existent").pipe(Effect.flip);

        expect(error._tag).toBe("GitOperationFailed");
        expect(error.operation).toBe("get-tree-sha");
        expect(error.detail).toBe("Failed to get tree SHA for 'non-existent'");
      }),
    );

    it.effect("fails with a typed git failure for non-git directory", () =>
      Effect.gen(function* () {
        const nonGitPath = path.join(tempDir, "not-a-repo");
        fs.mkdirSync(nonGitPath, { recursive: true });

        const error = yield* getTreeSha(nonGitPath).pipe(Effect.flip);

        expect(error._tag).toBe("GitOperationFailed");
        expect(error.operation).toBe("get-tree-sha");
      }),
    );
  });

  describe("immutable commit acquisition", () => {
    it.effect("fetches a recorded reachable commit after the branch advances", () =>
      Effect.gen(function* () {
        const source = path.join(tempDir, "source");
        const remote = path.join(tempDir, "remote.git");
        const checkout = path.join(tempDir, "checkout");
        yield* Effect.promise(() => createLocalRepo(source));
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        const gitOptions = { cwd: source, env: isolatedGitEnv(), stdio: "pipe" } as const;
        const recorded = execSync("git rev-parse HEAD", {
          ...gitOptions,
          encoding: "utf8",
        }).trim();
        fs.writeFileSync(path.join(source, "README.md"), "# Advanced");
        execSync("git add .", gitOptions);
        execSync("git commit -m 'Advance branch'", gitOptions);
        execSync(`git clone --bare "${source}" "${remote}"`, {
          cwd: tempDir,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        fs.mkdirSync(checkout);

        yield* shallowFetchCommit(remote, checkout, recorded).pipe(
          Effect.provide(NodeServices.layer),
        );

        expect(yield* getCommitSha(checkout)).toBe(recorded);
        expect(fs.readFileSync(path.join(checkout, "README.md"), "utf8")).toBe("# Test Repo");
      }),
    );

    it.effect("names the locator and commit when the recorded object is unreachable", () =>
      Effect.gen(function* () {
        const source = path.join(tempDir, "source");
        const remote = path.join(tempDir, "remote.git");
        const checkout = path.join(tempDir, "checkout");
        yield* Effect.promise(() => createLocalRepo(source));
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        const gitOptions = { cwd: source, env: isolatedGitEnv(), stdio: "pipe" } as const;
        execSync("git checkout -b temporary", gitOptions);
        fs.writeFileSync(path.join(source, "temporary.md"), "temporary\n");
        execSync("git add .", gitOptions);
        execSync("git commit -m 'Temporary commit'", gitOptions);
        const recorded = execSync("git rev-parse HEAD", {
          ...gitOptions,
          encoding: "utf8",
        }).trim();
        execSync(`git clone --bare "${source}" "${remote}"`, {
          cwd: tempDir,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        execSync("git update-ref -d refs/heads/temporary", {
          cwd: remote,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        execSync("git reflog expire --expire=now --all", {
          cwd: remote,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        execSync("git gc --prune=now", {
          cwd: remote,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        fs.mkdirSync(checkout);

        const failure = yield* shallowFetchCommit(remote, checkout, recorded).pipe(
          Effect.provide(NodeServices.layer),
          Effect.flip,
        );

        expect(failure.detail).toContain(remote);
        expect(failure.detail).toContain(recorded);
      }),
    );

    it.effect("lists advertised branches and tags", () =>
      Effect.gen(function* () {
        const source = path.join(tempDir, "source");
        const remote = path.join(tempDir, "remote.git");
        yield* Effect.promise(() => createLocalRepo(source));
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        execSync("git tag v1.0.0", {
          cwd: source,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        execSync("git tag v2.0.0", {
          cwd: source,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        execSync(`git clone --bare "${source}" "${remote}"`, {
          cwd: tempDir,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });

        const refs = yield* listRemoteRefs(remote).pipe(Effect.provide(NodeServices.layer));

        expect(refs.branches).toHaveLength(1);
        expect(refs.tags).toEqual(["v1.0.0", "v2.0.0"]);
      }),
    );
  });

  describe("compareDirectoryToHead", () => {
    it.effect("reports added, modified, and deleted package files relative to HEAD", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));
        const packagePath = path.join(repoPath, "packages", "review");
        fs.mkdirSync(path.join(packagePath, "src"), { recursive: true });
        fs.writeFileSync(path.join(packagePath, "skill.json"), "committed manifest\n");
        fs.writeFileSync(path.join(packagePath, "src", "SKILL.md"), "committed body\n");
        fs.writeFileSync(path.join(packagePath, "old.md"), "removed later\n");
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        const gitOptions = { cwd: repoPath, env: isolatedGitEnv(), stdio: "pipe" } as const;
        execSync("git add .", gitOptions);
        execSync("git commit -m 'Add package'", gitOptions);

        fs.writeFileSync(path.join(packagePath, "src", "SKILL.md"), "changed body\n");
        fs.writeFileSync(path.join(packagePath, "notes.md"), "untracked notes\n");
        fs.rmSync(path.join(packagePath, "old.md"));

        const comparison = yield* compareDirectoryToHead(repoPath, packagePath, [
          "notes.md",
          "skill.json",
          "src/SKILL.md",
        ]).pipe(Effect.provide(NodeServices.layer));

        expect(comparison.repositoryDirectory).toBe("packages/review");
        expect(comparison.headRevision).toMatch(/^[a-f0-9]{40}$/);
        expect(comparison.differences.map(({ path, change }) => ({ path, change }))).toEqual([
          { path: "notes.md", change: "added" },
          { path: "old.md", change: "deleted" },
          { path: "src/SKILL.md", change: "modified" },
        ]);
      }),
    );

    it.effect("reports no differences for an exact committed package", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        yield* Effect.promise(() => createLocalRepo(repoPath));

        const comparison = yield* compareDirectoryToHead(repoPath, repoPath, ["README.md"]).pipe(
          Effect.provide(NodeServices.layer),
        );

        expect(comparison.repositoryDirectory).toBe(".");
        expect(comparison.differences).toEqual([]);
      }),
    );

    it.effect("treats every current file as added when the worktree has no HEAD", () =>
      Effect.gen(function* () {
        const repoPath = path.join(tempDir, "repo");
        fs.mkdirSync(repoPath, { recursive: true });
        const { execSync } = yield* Effect.promise(() => import("node:child_process"));
        execSync("git init", {
          cwd: repoPath,
          env: isolatedGitEnv(),
          stdio: "pipe",
        });
        fs.writeFileSync(path.join(repoPath, "skill.json"), "uncommitted\n");

        const comparison = yield* compareDirectoryToHead(repoPath, repoPath, ["skill.json"]).pipe(
          Effect.provide(NodeServices.layer),
        );

        expect(comparison.headRevision).toBeUndefined();
        expect(comparison.differences).toEqual([{ path: "skill.json", change: "added" }]);
      }),
    );
  });

  describe("GitOperationFailed", () => {
    it("is a tagged error with correct tag", () => {
      const error = new GitOperationFailed({
        operation: "clone",
        detail: "Failed to clone repository",
      });

      expect(error._tag).toBe("GitOperationFailed");
      expect(error.operation).toBe("clone");
      expect(error.detail).toBe("Failed to clone repository");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new GitOperationFailed({
        operation: "clone",
        detail: "Failed to clone repository",
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });
});
