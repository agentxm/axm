// Raw node:fs/node:path and Git subprocesses are the repository convention for
// constructing mutable integration fixtures around Effect filesystem code.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { isolatedGitEnvironment, materializeGitIndexWorkspace } from "./staged-workspace.js";

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...isolatedGitEnvironment(),
      GIT_TERMINAL_PROMPT: "0",
    },
  });

const write = (root: string, relativePath: string, contents: string): void => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

describe("Git-index workspace materialization", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-workspace-test-"));
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    write(root, ".gitattributes", "*.txt text eol=crlf\n");
    write(root, "unchanged.txt", "unchanged\n");
    write(root, "partial.txt", "base\n");
    write(root, "deleted.txt", "delete me\n");
    write(root, "old-name.txt", "renamed\n");
    write(root, "executable.sh", "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(root, "executable.sh"), 0o755);
    fs.symlinkSync("unchanged.txt", path.join(root, "link.txt"));
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "fixture"]);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("copies the exact complete index without mutating repository state", () =>
    Effect.gen(function* () {
      write(root, "partial.txt", "staged\n");
      git(root, ["add", "partial.txt"]);
      const stagedBytes = git(root, ["show", ":partial.txt"]);
      write(root, "partial.txt", "unstaged\n");
      write(root, "untracked.txt", "untracked\n");
      fs.rmSync(path.join(root, "deleted.txt"));
      git(root, ["add", "deleted.txt"]);
      git(root, ["mv", "old-name.txt", "new-name.txt"]);
      const commit = git(root, ["rev-parse", "HEAD"]).trim();
      git(root, ["update-index", "--add", "--cacheinfo", `160000,${commit},vendor/dependency`]);

      const statusBefore = git(root, ["status", "--porcelain=v2", "-z"]);
      const indexBefore = git(root, ["ls-files", "--stage", "-z"]);
      const nested = path.join(root, "nested", "path");
      fs.mkdirSync(nested, { recursive: true });

      const snapshotPath = yield* Effect.scoped(
        Effect.gen(function* () {
          const snapshot = yield* materializeGitIndexWorkspace(nested);

          expect(snapshot.gitRoot).toBe(root);
          expect(snapshot.workspaceRoot).toBe(path.join(snapshot.snapshotRoot, "nested", "path"));
          expect(snapshot.displayWorkspaceRoot).toBe(nested);
          expect(snapshot.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
          expect(fs.readFileSync(path.join(snapshot.snapshotRoot, "unchanged.txt"), "utf8")).toBe(
            "unchanged\n",
          );
          expect(fs.readFileSync(path.join(snapshot.snapshotRoot, "partial.txt"), "utf8")).toBe(
            stagedBytes,
          );
          expect(fs.existsSync(path.join(snapshot.snapshotRoot, "untracked.txt"))).toBe(false);
          expect(fs.existsSync(path.join(snapshot.snapshotRoot, "deleted.txt"))).toBe(false);
          expect(fs.existsSync(path.join(snapshot.snapshotRoot, "old-name.txt"))).toBe(false);
          expect(fs.readFileSync(path.join(snapshot.snapshotRoot, "new-name.txt"), "utf8")).toBe(
            "renamed\n",
          );
          expect(fs.readlinkSync(path.join(snapshot.snapshotRoot, "link.txt"))).toBe(
            "unchanged.txt",
          );
          expect(
            fs.statSync(path.join(snapshot.snapshotRoot, "executable.sh")).mode & 0o111,
          ).not.toBe(0);
          expect(
            fs.statSync(path.join(snapshot.snapshotRoot, "vendor", "dependency")).isDirectory(),
          ).toBe(true);

          return snapshot.snapshotRoot;
        }),
      );

      expect(fs.existsSync(snapshotPath)).toBe(false);
      expect(git(root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(git(root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(fs.readFileSync(path.join(root, "partial.txt"), "utf8")).toBe("unstaged\n");
      expect(fs.readFileSync(path.join(root, "untracked.txt"), "utf8")).toBe("untracked\n");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fingerprints the complete ordered index identity", () =>
    Effect.gen(function* () {
      const first = yield* Effect.scoped(materializeGitIndexWorkspace(root));
      const second = yield* Effect.scoped(materializeGitIndexWorkspace(root));
      expect(second.fingerprint).toBe(first.fingerprint);

      write(root, "unchanged.txt", "changed\n");
      git(root, ["add", "unchanged.txt"]);
      const changed = yield* Effect.scoped(materializeGitIndexWorkspace(root));
      expect(changed.fingerprint).not.toBe(first.fingerprint);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects an unmerged index before materialization", () =>
    Effect.gen(function* () {
      git(root, ["checkout", "-q", "-b", "other"]);
      write(root, "partial.txt", "other\n");
      git(root, ["add", "partial.txt"]);
      git(root, ["commit", "--quiet", "-m", "other"]);
      git(root, ["checkout", "-q", "main"]);
      write(root, "partial.txt", "main\n");
      git(root, ["add", "partial.txt"]);
      git(root, ["commit", "--quiet", "-m", "main"]);
      expect(() => git(root, ["merge", "other"])).toThrow();

      const error = yield* Effect.scoped(materializeGitIndexWorkspace(root)).pipe(Effect.flip);
      expect(error.detail).toContain("unmerged entries");
      expect(error.detail).toContain("--view git-index");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails clearly outside a Git repository", () =>
    Effect.gen(function* () {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-outside-git-"));
      try {
        const error = yield* Effect.scoped(materializeGitIndexWorkspace(outside)).pipe(Effect.flip);
        expect(error.category).toBe("validation");
        expect(error.title).toBe("Git index unavailable");
        expect(error.detail).toContain("requires a Git repository");
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
