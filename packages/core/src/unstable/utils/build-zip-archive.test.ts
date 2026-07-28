/**
 * Unit tests for buildZipArchive.
 *
 * Validates that the archive builder does not mutate source directory
 * timestamps, produces a valid zip, and is deterministic across runs.
 */

import * as crypto from "node:crypto";
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

/** sha256 of the archive built from the fixture tree created in `beforeEach`. */
const PINNED_CLEAN_ARCHIVE_DIGEST =
  "36ff5d63e488993b5d39aeb209fce2f676d594112c1f2e992770a3a223c2e87c";

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

  // Publish guardrails must only ever reject an archive: rewriting or filtering
  // entries would change the bytes, and with them the integrity digest that
  // makes an already-published version verifiable. This pinned digest fails if
  // the output for a clean source tree ever shifts.
  it.effect("produces the pinned bytes for a clean source tree", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = yield* buildZipArchive(sourceDir);
        const digest = crypto.createHash("sha256").update(archive).digest("hex");

        expect(digest).toBe(PINNED_CLEAN_ARCHIVE_DIGEST);
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
