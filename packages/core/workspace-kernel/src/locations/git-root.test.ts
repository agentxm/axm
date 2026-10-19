import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { detectGitRoot, findGitRoot, isGitManaged } from "./git-root.js";

describe("git roots", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-detect-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("finds a git root with a .git directory", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));

        const root = yield* findGitRoot(tempDir);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("finds a git root with a .git file", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, ".git"), "gitdir: ../.git/worktrees/demo\n");

        const root = yield* findGitRoot(tempDir);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("finds a git root in an ancestor directory", () =>
    run(
      Effect.gen(function* () {
        const nested = path.join(tempDir, "packages", "demo");
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(nested, { recursive: true });

        const root = yield* findGitRoot(nested);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("returns none when no ancestor has a .git entry", () =>
    run(
      Effect.gen(function* () {
        const root = yield* findGitRoot(tempDir);
        const managed = yield* isGitManaged(tempDir);

        expect(root).toEqual(Option.none());
        expect(managed).toBe(false);
      }),
    ),
  );

  it.effect("stops at a parent the caller refuses", () =>
    run(
      Effect.gen(function* () {
        const nested = path.join(tempDir, "packages", "demo");
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(nested, { recursive: true });

        const root = yield* findGitRoot(nested, {
          continueTo: (parent) => parent !== tempDir,
        });

        expect(root).toEqual(Option.none());
      }),
    ),
  );

  it.effect("keeps inspection failures typed and lets detection walk past them", () =>
    Effect.gen(function* () {
      const unreadable = path.join(tempDir, "unreadable");
      const failing = FileSystem.makeNoop({
        exists: (target) =>
          target === path.join(unreadable, ".git")
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "exists",
                  pathOrDescriptor: target,
                }),
              )
            : Effect.succeed(target === path.join(tempDir, ".git")),
      });

      const failure = yield* findGitRoot(unreadable).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
        Effect.flip,
      );
      const detected = yield* detectGitRoot(unreadable).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
      );

      expect(failure.reason._tag).toBe("PermissionDenied");
      expect(detected).toEqual(Option.some(tempDir));
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
