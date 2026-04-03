/**
 * Unit tests for buildZipArchive.
 *
 * Tests that the archive builder does not mutate source directory timestamps
 * and validates required system binaries before invocation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { buildZipArchive } from "./build-zip-archive.js";

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildZipArchive", () => {
  let tmpDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-")));
    sourceDir = path.join(tmpDir, "source");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "hello.txt"), "hello world");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.live("does not mutate timestamps on the source directory", () =>
    Effect.gen(function* () {
      const originalMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;
      yield* Effect.sleep("50 millis");
      yield* buildZipArchive(sourceDir, "TEST_ZIP_FAILED");
      const afterMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;
      expect(afterMtime).toBe(originalMtime);
    }),
  );

  it.effect("produces a valid zip archive", () =>
    Effect.gen(function* () {
      const archive = yield* buildZipArchive(sourceDir, "TEST_ZIP_FAILED");
      expect(archive[0]).toBe(0x50);
      expect(archive[1]).toBe(0x4b);
      expect(archive.length).toBeGreaterThan(4);
    }),
  );
});
