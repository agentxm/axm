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
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeContentHash, HashError } from "../content-hash.js";

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
   * Helper to run an Effect with Node.js context
   */
  const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

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
    it("computes a hash in sha256:<hex> format", async () => {
      createFile("SKILL.md", "# Test Skill");

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("returns the same hash for the same content", async () => {
      createFile("SKILL.md", "# Test Skill");
      createFile("README.md", "Documentation");

      const hash1 = await runEffect(computeContentHash(tempDir));
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).toBe(hash2);
    });

    it("returns different hash when file content changes", async () => {
      createFile("SKILL.md", "# Test Skill");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Modify the file content
      createFile("SKILL.md", "# Updated Skill");
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).not.toBe(hash2);
    });

    it("returns different hash when a file is added", async () => {
      createFile("SKILL.md", "# Test Skill");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Add a new file
      createFile("extra.md", "Extra content");
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).not.toBe(hash2);
    });

    it("returns different hash when a file is removed", async () => {
      createFile("SKILL.md", "# Test Skill");
      createFile("extra.md", "Extra content");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Remove a file
      fs.unlinkSync(path.join(tempDir, "extra.md"));
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).not.toBe(hash2);
    });

    it("is deterministic regardless of file creation order", async () => {
      // Create files in one order
      createFile("a.md", "Content A");
      createFile("b.md", "Content B");
      createFile("c.md", "Content C");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Clean up and recreate in different order
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-hash-test-"));

      // Create files in reverse order
      createFile("c.md", "Content C");
      createFile("b.md", "Content B");
      createFile("a.md", "Content A");
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).toBe(hash2);
    });

    it("handles nested directories correctly", async () => {
      createFile("SKILL.md", "# Root");
      createFile("docs/guide.md", "# Guide");
      createFile("docs/advanced/tips.md", "# Tips");

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("produces different hashes for different directory structures with same content", async () => {
      createFile("a/file.md", "Content");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Clean up and create different structure
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-hash-test-"));

      createFile("b/file.md", "Content");
      const hash2 = await runEffect(computeContentHash(tempDir));

      // Hashes should differ because relative paths are different
      expect(hash1).not.toBe(hash2);
    });

    it("handles empty directories (no files)", async () => {
      // tempDir is already created and empty
      const hash = await runEffect(computeContentHash(tempDir));

      // Should produce a valid hash even for empty directory
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("handles binary files correctly", async () => {
      // Create a binary file with some bytes
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      fs.writeFileSync(path.join(tempDir, "binary.bin"), binaryContent);

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("returns HashError for non-existent directory", async () => {
      const nonExistentDir = path.join(tempDir, "does-not-exist");

      const result = await Effect.runPromise(
        computeContentHash(nonExistentDir).pipe(Effect.provide(NodeContext.layer), Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(HashError);
        expect(result.left.message).toContain("Failed to read directory");
      }
    });

    it("is independent of file timestamps", async () => {
      createFile("SKILL.md", "# Test Skill");
      const hash1 = await runEffect(computeContentHash(tempDir));

      // Change the file's mtime
      const futureTime = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
      fs.utimesSync(path.join(tempDir, "SKILL.md"), futureTime, futureTime);
      const hash2 = await runEffect(computeContentHash(tempDir));

      expect(hash1).toBe(hash2);
    });

    it("handles files with special characters in names", async () => {
      createFile("file with spaces.md", "Content");
      createFile("file-with-dashes.md", "Content");
      createFile("file_with_underscores.md", "Content");

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("handles deeply nested directories", async () => {
      createFile("a/b/c/d/e/f/deep.md", "Deep content");

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("handles files with unicode content", async () => {
      createFile("unicode.md", "Hello World");

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("handles large files", async () => {
      // Create a ~1MB file
      const largeContent = "x".repeat(1024 * 1024);
      createFile("large.txt", largeContent);

      const hash = await runEffect(computeContentHash(tempDir));

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
});
