import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLockfile, removeLockEntry, updateLockEntry, writeLockfile } from "./lockfile.js";
import type { LockEntry, Lockfile } from "./types.js";

describe("lockfile", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const runWithFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  const createTestEntry = (overrides?: Partial<LockEntry>): LockEntry => ({
    source: "github:example-org/agent-skills",
    skillPath: "skills/pr-review",
    commitSha: "abc123def456",
    contentHash: "sha256:789xyz",
    installedAt: "2026-01-28T10:00:00.000Z",
    updatedAt: "2026-01-28T10:00:00.000Z",
    ...overrides,
  });

  describe("readLockfile", () => {
    it("returns empty lockfile when file does not exist", async () => {
      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(result.version).toBe(1);
      expect(result.skills).toEqual({});
    });

    it("reads and parses valid lockfile", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      const lockfileContent = `version: 1
skills:
  pr-review:
    source: github:example-org/agent-skills
    skillPath: skills/pr-review
    commitSha: abc123def456
    contentHash: sha256:789xyz
    installedAt: 2026-01-28T10:00:00.000Z
    updatedAt: 2026-01-28T10:00:00.000Z
`;
      fs.writeFileSync(path.join(axmDir, "axm.lock"), lockfileContent);

      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(result.version).toBe(1);
      const prReview = result.skills["pr-review"];
      expect(prReview).toBeDefined();
      expect(prReview?.source).toBe("github:example-org/agent-skills");
      expect(prReview?.commitSha).toBe("abc123def456");
    });

    it("returns LockfileParseError for invalid YAML", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "axm.lock"),
        "version: 1\nskills:\n  - invalid: yaml: structure",
      );

      const result = await Effect.runPromise(
        readLockfile(axmDir).pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("LockfileParseError");
      }
    });

    it("returns empty lockfile for null content", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "axm.lock"), "null");

      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(result.version).toBe(1);
      expect(result.skills).toEqual({});
    });

    it("returns default version when version is missing", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "axm.lock"), "skills: {}");

      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(result.version).toBe(1);
    });
  });

  describe("writeLockfile", () => {
    it("creates directory if it does not exist", async () => {
      const lockfile: Lockfile = {
        version: 1,
        skills: {},
      };

      await runWithFileSystem(writeLockfile(axmDir, lockfile));

      expect(fs.existsSync(axmDir)).toBe(true);
    });

    it("writes lockfile in YAML format", async () => {
      const lockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": createTestEntry(),
        },
      };

      await runWithFileSystem(writeLockfile(axmDir, lockfile));

      const content = fs.readFileSync(path.join(axmDir, "axm.lock"), "utf-8");
      expect(content).toContain("version: 1");
      expect(content).toContain("pr-review:");
      expect(content).toContain("source: github:example-org/agent-skills");
    });

    it("overwrites existing lockfile", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "axm.lock"), "version: 1\nskills: {}");

      const lockfile: Lockfile = {
        version: 1,
        skills: {
          commit: createTestEntry({ skillPath: "skills/commit" }),
        },
      };

      await runWithFileSystem(writeLockfile(axmDir, lockfile));

      const result = await runWithFileSystem(readLockfile(axmDir));
      expect(result.skills["commit"]).toBeDefined();
    });
  });

  describe("updateLockEntry", () => {
    it("adds new entry to empty lockfile", async () => {
      const entry = createTestEntry();

      const result = await runWithFileSystem(updateLockEntry(axmDir, "pr-review", entry));

      const prReview = result.skills["pr-review"];
      expect(prReview).toBeDefined();
      expect(prReview?.source).toBe(entry.source);
    });

    it("preserves existing entries when adding new one", async () => {
      const initialLockfile: Lockfile = {
        version: 1,
        skills: {
          commit: createTestEntry({ skillPath: "skills/commit" }),
        },
      };
      await runWithFileSystem(writeLockfile(axmDir, initialLockfile));

      const newEntry = createTestEntry({ skillPath: "skills/review" });
      const result = await runWithFileSystem(updateLockEntry(axmDir, "review", newEntry));

      expect(result.skills["commit"]).toBeDefined();
      expect(result.skills["review"]).toBeDefined();
    });

    it("updates existing entry", async () => {
      const initialEntry = createTestEntry({ commitSha: "old-sha" });
      const initialLockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": initialEntry,
        },
      };
      await runWithFileSystem(writeLockfile(axmDir, initialLockfile));

      const updatedEntry = createTestEntry({ commitSha: "new-sha" });
      const result = await runWithFileSystem(updateLockEntry(axmDir, "pr-review", updatedEntry));

      expect(result.skills["pr-review"]?.commitSha).toBe("new-sha");
    });

    it("updates the updatedAt timestamp", async () => {
      const oldDate = "2020-01-01T00:00:00.000Z";
      const entry = createTestEntry({ updatedAt: oldDate });

      const result = await runWithFileSystem(updateLockEntry(axmDir, "pr-review", entry));

      const prReview = result.skills["pr-review"];
      expect(prReview).toBeDefined();
      expect(prReview?.updatedAt).not.toBe(oldDate);
      // Check it's a valid ISO date
      const updatedAt = prReview?.updatedAt ?? "";
      expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
    });

    it("persists changes to disk", async () => {
      const entry = createTestEntry();
      await runWithFileSystem(updateLockEntry(axmDir, "pr-review", entry));

      const readResult = await runWithFileSystem(readLockfile(axmDir));
      expect(readResult.skills["pr-review"]).toBeDefined();
    });
  });

  describe("removeLockEntry", () => {
    it("removes existing entry", async () => {
      const initialLockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": createTestEntry(),
          commit: createTestEntry({ skillPath: "skills/commit" }),
        },
      };
      await runWithFileSystem(writeLockfile(axmDir, initialLockfile));

      const result = await runWithFileSystem(removeLockEntry(axmDir, "pr-review"));

      expect(result.skills["pr-review"]).toBeUndefined();
      expect(result.skills["commit"]).toBeDefined();
    });

    it("does nothing when entry does not exist", async () => {
      const initialLockfile: Lockfile = {
        version: 1,
        skills: {
          commit: createTestEntry({ skillPath: "skills/commit" }),
        },
      };
      await runWithFileSystem(writeLockfile(axmDir, initialLockfile));

      const result = await runWithFileSystem(removeLockEntry(axmDir, "nonexistent"));

      expect(result.skills["commit"]).toBeDefined();
    });

    it("persists changes to disk", async () => {
      const initialLockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": createTestEntry(),
        },
      };
      await runWithFileSystem(writeLockfile(axmDir, initialLockfile));

      await runWithFileSystem(removeLockEntry(axmDir, "pr-review"));

      const readResult = await runWithFileSystem(readLockfile(axmDir));
      expect(readResult.skills["pr-review"]).toBeUndefined();
    });

    it("works on empty lockfile", async () => {
      const result = await runWithFileSystem(removeLockEntry(axmDir, "nonexistent"));

      expect(result.version).toBe(1);
      expect(result.skills).toEqual({});
    });
  });

  describe("YAML format round-trip", () => {
    it("preserves all fields through read/write cycle", async () => {
      const entry: LockEntry = {
        source: "github:example-org/agent-skills",
        skillPath: "skills/pr-review",
        commitSha: "abc123def456789012345678901234567890",
        contentHash: "sha256:xyz789abc123",
        installedAt: "2026-01-28T10:00:00.000Z",
        updatedAt: "2026-01-28T12:30:00.000Z",
      };
      const lockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": entry,
        },
      };

      await runWithFileSystem(writeLockfile(axmDir, lockfile));
      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(result.version).toBe(1);
      const prReview = result.skills["pr-review"];
      expect(prReview?.source).toBe(entry.source);
      expect(prReview?.skillPath).toBe(entry.skillPath);
      expect(prReview?.commitSha).toBe(entry.commitSha);
      expect(prReview?.contentHash).toBe(entry.contentHash);
      expect(prReview?.installedAt).toBe(entry.installedAt);
      expect(prReview?.updatedAt).toBe(entry.updatedAt);
    });

    it("handles multiple skills", async () => {
      const lockfile: Lockfile = {
        version: 1,
        skills: {
          "pr-review": createTestEntry({ skillPath: "skills/pr-review" }),
          commit: createTestEntry({ skillPath: "skills/commit" }),
          "code-review": createTestEntry({ skillPath: "skills/code-review" }),
        },
      };

      await runWithFileSystem(writeLockfile(axmDir, lockfile));
      const result = await runWithFileSystem(readLockfile(axmDir));

      expect(Object.keys(result.skills)).toHaveLength(3);
      expect(result.skills["pr-review"]).toBeDefined();
      expect(result.skills["commit"]).toBeDefined();
      expect(result.skills["code-review"]).toBeDefined();
    });
  });
});
