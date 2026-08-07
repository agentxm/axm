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

import { isolatedGitEnvironment, materializeStagedWorkspace } from "./staged-workspace.js";

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

describe("staged workspace materialization", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-workspace-test-"));
    git(root, ["init", "--quiet"]);
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

      const statusBefore = git(root, ["status", "--porcelain=v2", "-z"]);
      const indexBefore = git(root, ["ls-files", "--stage", "-z"]);
      const nested = path.join(root, "nested", "path");
      fs.mkdirSync(nested, { recursive: true });

      const snapshotPath = yield* Effect.scoped(
        Effect.gen(function* () {
          const snapshot = yield* materializeStagedWorkspace(nested);

          expect(snapshot.gitRoot).toBe(root);
          expect(fs.readFileSync(path.join(snapshot.workspaceRoot, "unchanged.txt"), "utf8")).toBe(
            "unchanged\n",
          );
          expect(fs.readFileSync(path.join(snapshot.workspaceRoot, "partial.txt"), "utf8")).toBe(
            stagedBytes,
          );
          expect(fs.existsSync(path.join(snapshot.workspaceRoot, "untracked.txt"))).toBe(false);
          expect(fs.existsSync(path.join(snapshot.workspaceRoot, "deleted.txt"))).toBe(false);
          expect(fs.existsSync(path.join(snapshot.workspaceRoot, "old-name.txt"))).toBe(false);
          expect(fs.readFileSync(path.join(snapshot.workspaceRoot, "new-name.txt"), "utf8")).toBe(
            "renamed\n",
          );
          expect(fs.readlinkSync(path.join(snapshot.workspaceRoot, "link.txt"))).toBe(
            "unchanged.txt",
          );
          expect(
            fs.statSync(path.join(snapshot.workspaceRoot, "executable.sh")).mode & 0o111,
          ).not.toBe(0);

          return snapshot.workspaceRoot;
        }),
      );

      expect(fs.existsSync(snapshotPath)).toBe(false);
      expect(git(root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(git(root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(fs.readFileSync(path.join(root, "partial.txt"), "utf8")).toBe("unstaged\n");
      expect(fs.readFileSync(path.join(root, "untracked.txt"), "utf8")).toBe("untracked\n");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails clearly outside a Git repository", () =>
    Effect.gen(function* () {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-outside-git-"));
      try {
        const error = yield* Effect.scoped(materializeStagedWorkspace(outside)).pipe(Effect.flip);
        expect(error.code).toBe("validation");
        expect(error.title).toBe("Git index unavailable");
        expect(error.detail).toContain("requires a Git repository");
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
