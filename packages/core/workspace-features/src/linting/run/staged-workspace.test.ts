// Raw node:fs/node:path and Git subprocesses are the repository convention for
// constructing mutable integration fixtures around Effect filesystem code.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
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
});

const gitBlob = (root: string, objectId: string): Buffer =>
  execFileSync("git", ["cat-file", "blob", objectId], {
    cwd: root,
    env: { ...isolatedGitEnvironment(), GIT_TERMINAL_PROMPT: "0" },
  });

const indexBlobs = (
  root: string,
): ReadonlyArray<{ readonly path: string; readonly objectId: string }> =>
  git(root, ["ls-files", "--stage", "-z"])
    .split("\0")
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [meta = "", entryPath = ""] = record.split("\t");
      const [mode, objectId = ""] = meta.split(" ");
      return mode === "100644" || mode === "100755" ? [{ path: entryPath, objectId }] : [];
    });

/**
 * Real filesystem with every primitive recorded and every `writeFile` payload
 * captured, optionally refusing `makeDirectory` for chosen paths.
 */
const instrumentedFileSystem = (
  options: { readonly refuseMakeDirectory?: (target: string) => boolean } = {},
) =>
  Effect.gen(function* () {
    const native = yield* FileSystem.FileSystem;
    const written: Array<Uint8Array> = [];
    const refuse = options.refuseMakeDirectory ?? (() => false);
    const capturing = FileSystem.make({
      ...native,
      makeDirectory: (target, makeOptions) =>
        refuse(target)
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "makeDirectory",
                pathOrDescriptor: target,
              }),
            )
          : native.makeDirectory(target, makeOptions),
      writeFile: (target, data, writeOptions) =>
        Effect.suspend(() => {
          written.push(data);
          return native.writeFile(target, data, writeOptions);
        }),
    });
    return { ...makeRecordingFileSystem(capturing), written };
  });

const isSnapshotChild = (target: string, name: string): boolean =>
  path.basename(target) === name &&
  path.basename(path.dirname(target)).startsWith("axm-lint-git-index-");

describe("Git-index workspace materialization of nested directories", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-nested-test-"));
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    for (const name of ["a/1", "a/2", "a/3", "b/4", "b/5", "b/6"]) {
      write(root, name, `contents of ${name}\n`);
    }
    fs.symlinkSync("1", path.join(root, "a", "link"));
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "fixture"]);
    const commit = git(root, ["rev-parse", "HEAD"]).trim();
    git(root, ["update-index", "--add", "--cacheinfo", `160000,${commit},sub/mod`]);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("creates each parent directory once and writes blobs without copying them", () =>
    Effect.gen(function* () {
      const { fileSystem, recording, written } = yield* instrumentedFileSystem();
      recording.reset();

      const { snapshotRoot, directories } = yield* Effect.scoped(
        Effect.gen(function* () {
          const snapshot = yield* materializeGitIndexWorkspace(root);
          expect(fs.readlinkSync(path.join(snapshot.snapshotRoot, "a", "link"))).toBe("1");
          expect(fs.statSync(path.join(snapshot.snapshotRoot, "sub", "mod")).isDirectory()).toBe(
            true,
          );
          for (const name of ["a/1", "a/2", "a/3", "b/4", "b/5", "b/6"]) {
            expect(fs.readFileSync(path.join(snapshot.snapshotRoot, name), "utf8")).toBe(
              `contents of ${name}\n`,
            );
          }
          return {
            snapshotRoot: snapshot.snapshotRoot,
            directories: recording
              .calls({ method: "makeDirectory" })
              .map((call) => path.relative(snapshot.snapshotRoot, call.path))
              .sort(),
          };
        }),
      ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));

      expect(fs.existsSync(snapshotRoot)).toBe(false);
      expect(directories).toEqual(["", "a", "b", path.join("sub", "mod")]);
      expect(written).toHaveLength(6);
      expect(new Set(written.map((data) => data.buffer)).size).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("creates the parent directories again for each materialization", () =>
    Effect.gen(function* () {
      const { fileSystem, recording } = yield* instrumentedFileSystem();
      const materialize = Effect.scoped(
        Effect.gen(function* () {
          recording.reset();
          const snapshot = yield* materializeGitIndexWorkspace(root);
          for (const name of ["a/1", "b/4"]) {
            expect(fs.readFileSync(path.join(snapshot.snapshotRoot, name), "utf8")).toBe(
              `contents of ${name}\n`,
            );
          }
          return recording
            .calls({ method: "makeDirectory" })
            .map((call) => path.relative(snapshot.snapshotRoot, call.path))
            .sort();
        }),
      ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));

      const first = yield* materialize;
      const second = yield* materialize;

      expect(first).toEqual(["", "a", "b", path.join("sub", "mod")]);
      expect(second).toEqual(["", "a", "b", path.join("sub", "mod")]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports the entry whose parent directory cannot be created", () =>
    Effect.gen(function* () {
      const { fileSystem, recording } = yield* instrumentedFileSystem({
        refuseMakeDirectory: (target) => isSnapshotChild(target, "b"),
      });

      const failure = yield* Effect.scoped(materializeGitIndexWorkspace(root)).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.flip,
      );

      expect(failure._tag).toBe("LintStagingFailed");
      expect(failure.detail).toMatch(/^Failed to materialize staged path: b\/[456]$/);
      expect(failure.cause).toMatchObject({ _tag: "PlatformError" });
      expect(
        recording
          .calls({ method: "makeDirectory" })
          .filter((call) => isSnapshotChild(call.path, "b"))
          .map((call) => call.outcome),
      ).toEqual(["failure"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("writes the exact index blob bytes, including empty and final blobs", () =>
    Effect.gen(function* () {
      write(root, "m/empty", "");
      fs.mkdirSync(path.join(root, "y"), { recursive: true });
      fs.writeFileSync(path.join(root, "y", "binary"), Buffer.from([0, 10, 255, 10, 13, 10, 0]));
      write(root, "z/last", "final blob\n");
      git(root, ["add", "."]);
      const blobs = indexBlobs(root);
      expect(blobs.at(-1)?.path).toBe("z/last");

      yield* Effect.scoped(
        Effect.gen(function* () {
          const snapshot = yield* materializeGitIndexWorkspace(root);
          for (const blob of blobs) {
            expect(fs.readFileSync(path.join(snapshot.snapshotRoot, blob.path)), blob.path).toEqual(
              gitBlob(root, blob.objectId),
            );
          }
          expect(fs.readFileSync(path.join(snapshot.snapshotRoot, "m", "empty"))).toHaveLength(0);
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("Git-index workspace containment", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-staged-escape-test-"));
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    write(root, "xx/evil", "outside\n");
    git(root, ["add", "."]);
    // Git refuses to stage a parent-relative path, so rewrite the one staged
    // name in place and reseal the index checksum.
    const indexPath = path.join(root, ".git", "index");
    const index = fs.readFileSync(indexPath);
    const body = Buffer.from(
      index
        .subarray(0, index.length - 20)
        .toString("latin1")
        .replace("xx/evil", "../evil"),
      "latin1",
    );
    fs.writeFileSync(indexPath, Buffer.concat([body, createHash("sha1").update(body).digest()]));
    expect(git(root, ["ls-files", "-z"])).toBe("../evil\0");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("refuses an index path that escapes the snapshot before creating its parent", () =>
    Effect.gen(function* () {
      const { fileSystem, recording, written } = yield* instrumentedFileSystem();
      recording.reset();

      const failure = yield* Effect.scoped(materializeGitIndexWorkspace(root)).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.flip,
      );

      expect(failure.detail).toBe("Git index path escapes the staged workspace: ../evil");
      expect(recording.calls({ method: "makeDirectory" })).toEqual([]);
      expect(written).toEqual([]);
      expect(fs.existsSync(path.join(path.dirname(root), "evil"))).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
