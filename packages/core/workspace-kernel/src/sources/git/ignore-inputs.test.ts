import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { observeGitIgnoreInputs } from "../index.js";

describe("publication ignore discovery", () => {
  it.effect("observes repository ancestors and nested inputs and rediscoveries", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(root, "skills", "review");
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.makeDirectory(path.join(packageRoot, "src"), { recursive: true });
      yield* fs.writeFileString(path.join(root, ".gitignore"), "# comment\n*.log\n");
      yield* fs.writeFileString(path.join(root, "skills", ".gitignore"), "dist/\n");
      yield* fs.writeFileString(path.join(packageRoot, "src", ".gitignore"), "!keep.log\n");
      const before = yield* observeGitIgnoreInputs({ packageRoot });
      expect(before.boundaryRoot).toBe(root);
      expect(before.packageDirectory).toBe("skills/review");
      expect(before.rules.map(({ origin }) => origin)).toEqual([
        { kind: "gitignore", file: ".gitignore", line: 2 },
        { kind: "gitignore", file: "skills/.gitignore", line: 1 },
        { kind: "gitignore", file: "skills/review/src/.gitignore", line: 1 },
      ]);
      yield* fs.writeFileString(path.join(packageRoot, ".gitignore"), "*.map\n");
      const added = yield* observeGitIgnoreInputs({ packageRoot });
      expect(added.fingerprint).not.toBe(before.fingerprint);
      yield* fs.remove(path.join(packageRoot, ".gitignore"));
      expect((yield* observeGitIgnoreInputs({ packageRoot })).fingerprint).toBe(before.fingerprint);
      yield* fs.writeFileString(path.join(root, ".gitignore"), "*.txt\n");
      expect((yield* observeGitIgnoreInputs({ packageRoot })).fingerprint).not.toBe(
        before.fingerprint,
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses the nearest repository boundary around the package root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(root, "nested", "package");
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.makeDirectory(path.join(root, "nested", ".git"), { recursive: true });
      yield* fs.makeDirectory(packageRoot);
      yield* fs.writeFileString(path.join(root, ".gitignore"), "**\n");
      yield* fs.writeFileString(path.join(root, "nested", ".gitignore"), "dist/\n");
      const snapshot = yield* observeGitIgnoreInputs({ packageRoot });
      expect(snapshot.boundaryRoot).toBe(path.join(root, "nested"));
      expect(snapshot.rules.map(({ pattern }) => pattern)).toEqual(["dist/"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("bounds standalone directories and refuses linked ignore files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(root, "package");
      yield* fs.makeDirectory(packageRoot);
      yield* fs.writeFileString(path.join(root, ".gitignore"), "**\n");
      const snapshot = yield* observeGitIgnoreInputs({ packageRoot });
      expect(snapshot.boundaryRoot).toBe(packageRoot);
      expect(snapshot.rules).toEqual([]);
      yield* fs.symlink(path.join(root, ".gitignore"), path.join(packageRoot, ".gitignore"));
      const result = yield* observeGitIgnoreInputs({ packageRoot }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not descend through directory links or worktree administration files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(root, "worktree");
      yield* fs.makeDirectory(packageRoot);
      yield* fs.writeFileString(path.join(packageRoot, ".git"), "gitdir: ../admin\n");
      yield* fs.writeFileString(path.join(packageRoot, ".gitignore"), "dist/\n");
      yield* fs.symlink(packageRoot, path.join(packageRoot, "loop"));
      const snapshot = yield* observeGitIgnoreInputs({ packageRoot });
      expect(snapshot.rules).toHaveLength(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
