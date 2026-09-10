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
import { buildZipArchive, planZipArchive } from "./archive.js";

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** sha256 of the archive built from the fixture tree created in `beforeEach`. */
const PINNED_CLEAN_ARCHIVE_DIGEST =
  "549b3040df405bf93ce2c6dc580ae354684cfecc1b5f678362d8a7f0bb2ff82d";

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

  // The ignore option is opt-in. Anything that made the no-policy path diverge
  // — including passing an options object at all — would change the digest of
  // every archive published without a policy.
  it.effect("produces the pinned bytes when no ignore policy is configured", () =>
    withNodeContext(
      Effect.gen(function* () {
        const noOptions = yield* buildZipArchive(sourceDir);
        const emptyOptions = yield* buildZipArchive(sourceDir, {});
        const undefinedIgnore = yield* buildZipArchive(sourceDir, { ignore: undefined });
        const emptyIgnore = yield* buildZipArchive(sourceDir, { ignore: [] });

        for (const archive of [emptyOptions, undefinedIgnore, emptyIgnore]) {
          expect(Buffer.from(archive).equals(Buffer.from(noOptions))).toBe(true);
        }
        expect(crypto.createHash("sha256").update(noOptions).digest("hex")).toBe(
          PINNED_CLEAN_ARCHIVE_DIGEST,
        );
      }),
    ),
  );

  it.effect("omits entries matching an ignore pattern", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = yield* buildZipArchive(sourceDir, { ignore: ["nested/*"] });

        expect(Object.keys(unzipSync(archive))).toEqual(["hello.txt"]);
      }),
    ),
  );

  it.effect("reports the exact archive inventory and ignore-pattern attribution", () =>
    withNodeContext(
      Effect.gen(function* () {
        const planned = yield* planZipArchive(sourceDir, {
          ignore: ["nested/*", "missing-*"],
        });

        expect(planned.plan).toEqual({
          included: [{ path: "hello.txt", size: 11, matchedPatterns: [] }],
          excluded: [
            {
              path: "nested/inner.txt",
              size: 5,
              matchedPatterns: ["nested/*"],
            },
          ],
          patterns: [
            { pattern: "nested/*", matchCount: 1 },
            { pattern: "missing-*", matchCount: 0 },
          ],
          warnings: ['publish.ignore pattern "missing-*" matched no files.'],
          includedCount: 1,
          excludedCount: 1,
          uncompressedBytes: 11,
        });
        expect(Object.keys(unzipSync(planned.archive))).toEqual(["hello.txt"]);
      }),
    ),
  );

  it.effect("matches ignore patterns against archive-relative paths", () =>
    withNodeContext(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(sourceDir, "notes.md"), "notes");
        fs.writeFileSync(path.join(sourceDir, "nested", "notes.md"), "nested notes");

        const archive = yield* buildZipArchive(sourceDir, { ignore: ["*.md"] });

        // `*` spans separators, so a bare extension pattern reaches nested paths.
        expect(Object.keys(unzipSync(archive)).sort()).toEqual(["hello.txt", "nested/inner.txt"]);
      }),
    ),
  );

  it.effect("leaves the archive alone when no path matches the patterns", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = yield* buildZipArchive(sourceDir, { ignore: ["never-matches-*"] });

        expect(crypto.createHash("sha256").update(archive).digest("hex")).toBe(
          PINNED_CLEAN_ARCHIVE_DIGEST,
        );
      }),
    ),
  );
});
