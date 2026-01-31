/**
 * Unit tests for content-hash module.
 *
 * Tests the deterministic content hashing algorithm for skill directories.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { computeContentHash, HashError } from "./content-hash.js";

describe("content-hash", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-hash-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to provide Node.js context to an Effect
   */
  const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  /**
   * Helper to create a file in the temp directory
   */
  const createFile = (relativePath: string, content: string) => {
    const fullPath = path.join(tempDir, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  };

  describe("computeContentHash", () => {
    it.effect("computes a hash in sha256:<hex> format", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("returns the same hash for the same content", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");
          createFile("README.md", "Documentation");

          const hash1 = yield* computeContentHash(tempDir);
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).toBe(hash2);
        }),
      ),
    );

    it.effect("returns different hash when file content changes", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");
          const hash1 = yield* computeContentHash(tempDir);

          // Modify the file content
          createFile("SKILL.md", "# Updated Skill");
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).not.toBe(hash2);
        }),
      ),
    );

    it.effect("returns different hash when a file is added", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");
          const hash1 = yield* computeContentHash(tempDir);

          // Add a new file
          createFile("extra.md", "Extra content");
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).not.toBe(hash2);
        }),
      ),
    );

    it.effect("returns different hash when a file is removed", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");
          createFile("extra.md", "Extra content");
          const hash1 = yield* computeContentHash(tempDir);

          // Remove a file
          fs.unlinkSync(path.join(tempDir, "extra.md"));
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).not.toBe(hash2);
        }),
      ),
    );

    it.effect("is deterministic regardless of file creation order", () =>
      withNodeContext(
        Effect.gen(function* () {
          // Create files in one order
          createFile("a.md", "Content A");
          createFile("b.md", "Content B");
          createFile("c.md", "Content C");
          const hash1 = yield* computeContentHash(tempDir);

          // Clean up and recreate in different order
          fs.rmSync(tempDir, { recursive: true, force: true });
          tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-hash-test-"));

          // Create files in reverse order
          createFile("c.md", "Content C");
          createFile("b.md", "Content B");
          createFile("a.md", "Content A");
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).toBe(hash2);
        }),
      ),
    );

    it.effect("handles nested directories correctly", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Root");
          createFile("docs/guide.md", "# Guide");
          createFile("docs/advanced/tips.md", "# Tips");

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect(
      "produces different hashes for different directory structures with same content",
      () =>
        withNodeContext(
          Effect.gen(function* () {
            createFile("a/file.md", "Content");
            const hash1 = yield* computeContentHash(tempDir);

            // Clean up and create different structure
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-hash-test-"));

            createFile("b/file.md", "Content");
            const hash2 = yield* computeContentHash(tempDir);

            // Hashes should differ because relative paths are different
            expect(hash1).not.toBe(hash2);
          }),
        ),
    );

    it.effect("handles empty directories (no files)", () =>
      withNodeContext(
        Effect.gen(function* () {
          // tempDir is already created and empty
          const hash = yield* computeContentHash(tempDir);

          // Should produce a valid hash even for empty directory
          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("handles binary files correctly", () =>
      withNodeContext(
        Effect.gen(function* () {
          // Create a binary file with some bytes
          const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
          fs.writeFileSync(path.join(tempDir, "binary.bin"), binaryContent);

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("returns HashError for non-existent directory", () =>
      withNodeContext(
        Effect.gen(function* () {
          const nonExistentDir = path.join(tempDir, "does-not-exist");

          const error = yield* computeContentHash(nonExistentDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(HashError);
          expect(error.message).toContain("Failed to read directory");
        }),
      ),
    );

    it.live("is independent of file timestamps", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("SKILL.md", "# Test Skill");
          const hash1 = yield* computeContentHash(tempDir);

          // Change the file's mtime
          const futureTime = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
          fs.utimesSync(path.join(tempDir, "SKILL.md"), futureTime, futureTime);
          const hash2 = yield* computeContentHash(tempDir);

          expect(hash1).toBe(hash2);
        }),
      ),
    );

    it.effect("handles files with special characters in names", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("file with spaces.md", "Content");
          createFile("file-with-dashes.md", "Content");
          createFile("file_with_underscores.md", "Content");

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("handles deeply nested directories", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("a/b/c/d/e/f/deep.md", "Deep content");

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("handles files with unicode content", () =>
      withNodeContext(
        Effect.gen(function* () {
          createFile("unicode.md", "Hello World");

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );

    it.effect("handles large files", () =>
      withNodeContext(
        Effect.gen(function* () {
          // Create a ~1MB file
          const largeContent = "x".repeat(1024 * 1024);
          createFile("large.txt", largeContent);

          const hash = yield* computeContentHash(tempDir);

          expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        }),
      ),
    );
  });
});
