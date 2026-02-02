import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  LockfileParseError,
  readLockfile,
  removeLockEntry,
  updateLockEntry,
  writeLockfile,
} from "./lockfile.js";
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

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  const createTestEntry = (overrides?: Partial<LockEntry>): LockEntry => ({
    source: "github:example-org/agent-skills",
    origin: "https://github.com/example-org/agent-skills",
    folderHash: "abc123def456789012345678901234567890",
    installedAt: "2026-01-28T10:00:00.000Z",
    updatedAt: "2026-01-28T10:00:00.000Z",
    ...overrides,
  });

  describe("readLockfile", () => {
    it.effect("returns empty lockfile when file does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          expect(result.extensions.skills).toEqual({});
        }),
      ),
    );

    it.effect("reads and parses valid lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const lockfileContent = JSON.stringify({
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": {
                  source: "github:example-org/agent-skills",
                  origin: "https://github.com/example-org/agent-skills",
                  folderHash: "abc123def456",
                  installedAt: "2026-01-28T10:00:00.000Z",
                  updatedAt: "2026-01-28T10:00:00.000Z",
                },
              },
            },
          });
          fs.writeFileSync(path.join(axmDir, "axm.lock"), lockfileContent);

          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          const prReview = result.extensions.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.source).toBe("github:example-org/agent-skills");
          expect(prReview?.folderHash).toBe("abc123def456");
        }),
      ),
    );

    it.effect("returns LockfileParseError for invalid JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm.lock"), "{ invalid json }");

          const error = yield* readLockfile(axmDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(LockfileParseError);
          expect(error._tag).toBe("LockfileParseError");
        }),
      ),
    );

    it.effect("returns empty lockfile for null content", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm.lock"), "null");

          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          expect(result.extensions.skills).toEqual({});
        }),
      ),
    );

    it.effect("returns default version when lockfileVersion is missing", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "axm.lock"),
            JSON.stringify({ extensions: { skills: {} } }),
          );

          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
        }),
      ),
    );
  });

  describe("writeLockfile", () => {
    it.effect("creates directory if it does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: { skills: {} },
          };

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.existsSync(axmDir)).toBe(true);
        }),
      ),
    );

    it.effect("writes lockfile in JSON format", () =>
      withFileSystem(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": createTestEntry(),
              },
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const content = fs.readFileSync(path.join(axmDir, "axm.lock"), "utf-8");
          const parsed = JSON.parse(content);
          expect(parsed.lockfileVersion).toBe(1);
          expect(parsed.extensions.skills["pr-review"]).toBeDefined();
          expect(parsed.extensions.skills["pr-review"].source).toBe(
            "github:example-org/agent-skills",
          );
        }),
      ),
    );

    it.effect("overwrites existing lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "axm.lock"),
            JSON.stringify({ lockfileVersion: 1, extensions: { skills: {} } }),
          );

          const lockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                commit: createTestEntry({ source: "github:other/repo" }),
              },
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const result = yield* readLockfile(axmDir);
          expect(result.extensions.skills["commit"]).toBeDefined();
        }),
      ),
    );
  });

  describe("updateLockEntry", () => {
    it.effect("adds new entry to empty lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          const entry = createTestEntry();

          const result = yield* updateLockEntry(axmDir, "pr-review", entry);

          const prReview = result.extensions.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.source).toBe(entry.source);
        }),
      ),
    );

    it.effect("preserves existing entries when adding new one", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                commit: createTestEntry({ source: "github:other/commit" }),
              },
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const newEntry = createTestEntry({ source: "github:other/review" });
          const result = yield* updateLockEntry(axmDir, "review", newEntry);

          expect(result.extensions.skills["commit"]).toBeDefined();
          expect(result.extensions.skills["review"]).toBeDefined();
        }),
      ),
    );

    it.effect("updates existing entry", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialEntry = createTestEntry({ folderHash: "old-hash" });
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": initialEntry,
              },
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const updatedEntry = createTestEntry({ folderHash: "new-hash" });
          const result = yield* updateLockEntry(axmDir, "pr-review", updatedEntry);

          expect(result.extensions.skills["pr-review"]?.folderHash).toBe("new-hash");
        }),
      ),
    );

    it.live("updates the updatedAt timestamp", () =>
      withFileSystem(
        Effect.gen(function* () {
          const oldDate = "2020-01-01T00:00:00.000Z";
          const entry = createTestEntry({ updatedAt: oldDate });

          const result = yield* updateLockEntry(axmDir, "pr-review", entry);

          const prReview = result.extensions.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.updatedAt).not.toBe(oldDate);
          // Check it's a valid ISO date
          const updatedAt = prReview?.updatedAt ?? "";
          expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
        }),
      ),
    );

    it.effect("persists changes to disk", () =>
      withFileSystem(
        Effect.gen(function* () {
          const entry = createTestEntry();
          yield* updateLockEntry(axmDir, "pr-review", entry);

          const readResult = yield* readLockfile(axmDir);
          expect(readResult.extensions.skills["pr-review"]).toBeDefined();
        }),
      ),
    );
  });

  describe("removeLockEntry", () => {
    it.effect("removes existing entry", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": createTestEntry(),
                commit: createTestEntry({ source: "github:other/commit" }),
              },
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const result = yield* removeLockEntry(axmDir, "pr-review");

          expect(result.extensions.skills["pr-review"]).toBeUndefined();
          expect(result.extensions.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("does nothing when entry does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                commit: createTestEntry({ source: "github:other/commit" }),
              },
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const result = yield* removeLockEntry(axmDir, "nonexistent");

          expect(result.extensions.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("persists changes to disk", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": createTestEntry(),
              },
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          yield* removeLockEntry(axmDir, "pr-review");

          const readResult = yield* readLockfile(axmDir);
          expect(readResult.extensions.skills["pr-review"]).toBeUndefined();
        }),
      ),
    );

    it.effect("works on empty lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* removeLockEntry(axmDir, "nonexistent");

          expect(result.lockfileVersion).toBe(1);
          expect(result.extensions.skills).toEqual({});
        }),
      ),
    );
  });

  describe("JSON format round-trip", () => {
    it.effect("preserves all fields through read/write cycle", () =>
      withFileSystem(
        Effect.gen(function* () {
          const entry: LockEntry = {
            source: "github:example-org/agent-skills",
            origin: "https://github.com/example-org/agent-skills",
            folderHash: "abc123def456789012345678901234567890",
            installedAt: "2026-01-28T10:00:00.000Z",
            updatedAt: "2026-01-28T12:30:00.000Z",
          };
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": entry,
              },
            },
          };

          yield* writeLockfile(axmDir, lockfile);
          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          const prReview = result.extensions.skills["pr-review"];
          expect(prReview?.source).toBe(entry.source);
          expect(prReview?.origin).toBe(entry.origin);
          expect(prReview?.folderHash).toBe(entry.folderHash);
          expect(prReview?.installedAt).toBe(entry.installedAt);
          expect(prReview?.updatedAt).toBe(entry.updatedAt);
        }),
      ),
    );

    it.effect("handles multiple skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            extensions: {
              skills: {
                "pr-review": createTestEntry({ source: "github:org/pr-review" }),
                commit: createTestEntry({ source: "github:org/commit" }),
                "code-review": createTestEntry({ source: "github:org/code-review" }),
              },
            },
          };

          yield* writeLockfile(axmDir, lockfile);
          const result = yield* readLockfile(axmDir);

          expect(Object.keys(result.extensions.skills)).toHaveLength(3);
          expect(result.extensions.skills["pr-review"]).toBeDefined();
          expect(result.extensions.skills["commit"]).toBeDefined();
          expect(result.extensions.skills["code-review"]).toBeDefined();
        }),
      ),
    );
  });
});
