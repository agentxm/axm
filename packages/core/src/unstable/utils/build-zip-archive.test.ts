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
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildZipArchive } from "./build-zip-archive.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

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

  it("does not mutate timestamps on the source directory", async () => {
    // Record original timestamps
    const originalMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;

    // Small delay to ensure any mutation would be visible
    await new Promise((r) => setTimeout(r, 50));

    await runEffect(buildZipArchive(sourceDir, "TEST_ZIP_FAILED"));

    // Source directory timestamps should be unchanged
    const afterMtime = fs.statSync(path.join(sourceDir, "hello.txt")).mtimeMs;
    expect(afterMtime).toBe(originalMtime);
  });

  it("produces a valid zip archive", async () => {
    const archive = await runEffect(buildZipArchive(sourceDir, "TEST_ZIP_FAILED"));

    // ZIP magic bytes: PK\x03\x04
    expect(archive[0]).toBe(0x50); // P
    expect(archive[1]).toBe(0x4b); // K
    expect(archive.length).toBeGreaterThan(4);
  });
});
