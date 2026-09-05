import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { resolveParentSymlinks } from "./resolve-parent-symlinks.js";

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("resolveParentSymlinks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "resolve-parent-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("returns path unchanged when parent is a real directory", () =>
    withNodeContext(
      Effect.gen(function* () {
        const realDir = path.join(tmpDir, "real-dir");
        fs.mkdirSync(realDir);

        const result = yield* resolveParentSymlinks(path.join(realDir, "file.txt"));
        expect(result).toBe(path.join(realDir, "file.txt"));
      }),
    ),
  );

  it.effect("resolves parent symlink while preserving final component", () =>
    withNodeContext(
      Effect.gen(function* () {
        const realDir = path.join(tmpDir, "real-dir");
        fs.mkdirSync(realDir);

        const symlinkDir = path.join(tmpDir, "symlink-dir");
        fs.symlinkSync(realDir, symlinkDir);

        const result = yield* resolveParentSymlinks(path.join(symlinkDir, "file.txt"));
        expect(result).toBe(path.join(realDir, "file.txt"));
      }),
    ),
  );

  it.effect("preserves final component even if it is a symlink", () =>
    withNodeContext(
      Effect.gen(function* () {
        const realDir = path.join(tmpDir, "real-dir");
        fs.mkdirSync(realDir);

        const targetFile = path.join(realDir, "target.txt");
        fs.writeFileSync(targetFile, "content");

        const symlinkFile = path.join(realDir, "link.txt");
        fs.symlinkSync(targetFile, symlinkFile);

        const result = yield* resolveParentSymlinks(symlinkFile);
        // Final component "link.txt" should be preserved, not resolved to "target.txt"
        expect(result).toBe(symlinkFile);
      }),
    ),
  );

  it.effect("resolves deeply nested symlinks in parent chain", () =>
    withNodeContext(
      Effect.gen(function* () {
        // Create: realA -> realB (symlink), realB -> realC (real)
        const realC = path.join(tmpDir, "real-c");
        fs.mkdirSync(realC);

        const realB = path.join(tmpDir, "real-b");
        fs.symlinkSync(realC, realB);

        const realA = path.join(tmpDir, "real-a");
        fs.symlinkSync(realB, realA);

        const result = yield* resolveParentSymlinks(path.join(realA, "file.txt"));
        expect(result).toBe(path.join(realC, "file.txt"));
      }),
    ),
  );

  it.effect("resolves the nearest existing ancestor when parents are missing", () =>
    withNodeContext(
      Effect.gen(function* () {
        const realDir = path.join(tmpDir, "real-dir");
        fs.mkdirSync(realDir);

        const symlinkDir = path.join(tmpDir, "symlink-dir");
        fs.symlinkSync(realDir, symlinkDir);

        const result = yield* resolveParentSymlinks(
          path.join(symlinkDir, "missing", "nested", "file.txt"),
        );
        expect(result).toBe(path.join(realDir, "missing", "nested", "file.txt"));
      }),
    ),
  );
});
