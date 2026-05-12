/**
 * Unit tests for buildZipArchive.
 *
 * Validates that the archive builder does not mutate source directory
 * timestamps, produces a valid zip, and is deterministic across runs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { unzipSync } from "fflate";
import { buildZipArchive } from "./build-zip-archive.js";

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("buildZipArchive", () => {
  let tmpDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-")));
    sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "hello.txt"), "hello world");
    fs.mkdirSync(path.join(sourceDir, "nested"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "nested", "inner.txt"), "inner");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("does not mutate timestamps on the source directory", () =>
    withNodeContext(
      Effect.gen(function* () {
        const originalMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;
        yield* buildZipArchive(sourceDir);
        const afterMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;
        expect(afterMtime).toBe(originalMtime);
      }),
    ),
  );

  it.effect("produces a valid zip archive with file contents", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = yield* buildZipArchive(sourceDir);
        expect(archive[0]).toBe(0x50);
        expect(archive[1]).toBe(0x4b);
        const entries = unzipSync(archive);
        expect(Object.keys(entries).sort()).toEqual(["hello.txt", "nested/inner.txt"]);
        expect(new TextDecoder().decode(entries["hello.txt"])).toBe("hello world");
        expect(new TextDecoder().decode(entries["nested/inner.txt"])).toBe("inner");
      }),
    ),
  );

  it.effect("produces byte-identical archives across runs", () =>
    withNodeContext(
      Effect.gen(function* () {
        const a = yield* buildZipArchive(sourceDir);
        const b = yield* buildZipArchive(sourceDir);
        expect(a.length).toBe(b.length);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
      }),
    ),
  );
});
