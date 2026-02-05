import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import type { Lockfile, SkillLockEntry } from "../../workspace/lockfile-schema.js";
import {
  LockfileParseError,
  readLockfile,
  removeLockEntry,
  updateLockEntry,
  writeLockfile,
} from "./lockfile.js";

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

  const createTestEntry = (
    overrides?: Partial<SkillLockEntry>,
  ): SkillLockEntry & { source: "github" } => ({
    source: "github",
    owner: "example-org",
    repo: "agent-skills",
    agents: ["claude-code"],
    installedAt: new Date("2026-01-28T10:00:00.000Z"),
    updatedAt: new Date("2026-01-28T10:00:00.000Z"),
    ...(overrides as Partial<SkillLockEntry & { source: "github" }>),
  });

  describe("readLockfile", () => {
    it.effect("returns empty lockfile when file does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          expect(result.skills).toEqual({});
        }),
      ),
    );

    it.effect("reads and parses valid lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const lockfileContent = YAML.stringify({
            lockfileVersion: 1,
            skills: {
              "pr-review": {
                source: "github",
                owner: "example-org",
                repo: "agent-skills",
                agents: ["claude-code"],
                installedAt: "2026-01-28T10:00:00.000Z",
                updatedAt: "2026-01-28T10:00:00.000Z",
              },
            },
          });
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), lockfileContent);

          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          const prReview = result.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.source).toBe("github");
          if (prReview?.source === "github") {
            expect(prReview?.owner).toBe("example-org");
            expect(prReview?.repo).toBe("agent-skills");
          }
          expect(prReview?.agents).toEqual(["claude-code"]);
        }),
      ),
    );

    it.effect("returns LockfileParseError for invalid YAML", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "invalid: yaml: content:");

          const error = yield* readLockfile(axmDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(LockfileParseError);
          expect(error._tag).toBe("LockfileParseError");
        }),
      ),
    );

    it.effect("returns LockfileParseError for null content", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "null");

          const error = yield* readLockfile(axmDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(LockfileParseError);
          expect(error._tag).toBe("LockfileParseError");
        }),
      ),
    );

    it.effect("returns LockfileParseError when lockfileVersion is missing", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify({ skills: {} }));

          const error = yield* readLockfile(axmDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(LockfileParseError);
          expect(error._tag).toBe("LockfileParseError");
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
            skills: {},
          };

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.existsSync(axmDir)).toBe(true);
        }),
      ),
    );

    it.effect("writes lockfile in YAML format", () =>
      withFileSystem(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              "pr-review": createTestEntry(),
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const content = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
          const parsed = YAML.parse(content);
          expect(parsed.lockfileVersion).toBe(1);
          expect(parsed.skills["pr-review"]).toBeDefined();
          expect(parsed.skills["pr-review"].source).toBe("github");
          expect(parsed.skills["pr-review"].owner).toBe("example-org");
          expect(parsed.skills["pr-review"].repo).toBe("agent-skills");
        }),
      ),
    );

    it.effect("overwrites existing lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "axm-lock.yaml"),
            YAML.stringify({ lockfileVersion: 1, skills: {} }),
          );

          const lockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              commit: createTestEntry({
                owner: "other",
                repo: "repo",
              }),
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const result = yield* readLockfile(axmDir);
          expect(result.skills["commit"]).toBeDefined();
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

          const prReview = result.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.source).toBe("github");
        }),
      ),
    );

    it.effect("preserves existing entries when adding new one", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              commit: createTestEntry({
                owner: "other",
                repo: "commit",
              }),
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const newEntry = createTestEntry({
            owner: "other",
            repo: "review",
          });
          const result = yield* updateLockEntry(axmDir, "review", newEntry);

          expect(result.skills["commit"]).toBeDefined();
          expect(result.skills["review"]).toBeDefined();
        }),
      ),
    );

    it.effect("updates existing entry", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialEntry = createTestEntry({ gitTreeHash: "old-hash" });
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              "pr-review": initialEntry,
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const updatedEntry = createTestEntry({ gitTreeHash: "new-hash" });
          const result = yield* updateLockEntry(axmDir, "pr-review", updatedEntry);

          expect(result.skills["pr-review"]?.gitTreeHash).toBe("new-hash");
        }),
      ),
    );

    it.live("updates the updatedAt timestamp", () =>
      withFileSystem(
        Effect.gen(function* () {
          const oldDate = new Date("2020-01-01T00:00:00.000Z");
          const entry = createTestEntry({ updatedAt: oldDate });

          const result = yield* updateLockEntry(axmDir, "pr-review", entry);

          const prReview = result.skills["pr-review"];
          expect(prReview).toBeDefined();
          expect(prReview?.updatedAt).not.toEqual(oldDate);
          // Check it's a valid Date
          expect(prReview?.updatedAt).toBeInstanceOf(Date);
          expect(prReview?.updatedAt.toISOString()).toBe(prReview?.updatedAt.toISOString());
        }),
      ),
    );

    it.effect("persists changes to disk", () =>
      withFileSystem(
        Effect.gen(function* () {
          const entry = createTestEntry();
          yield* updateLockEntry(axmDir, "pr-review", entry);

          const readResult = yield* readLockfile(axmDir);
          expect(readResult.skills["pr-review"]).toBeDefined();
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
            skills: {
              "pr-review": createTestEntry(),
              commit: createTestEntry({
                owner: "other",
                repo: "commit",
              }),
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const result = yield* removeLockEntry(axmDir, "pr-review");

          expect(result.skills["pr-review"]).toBeUndefined();
          expect(result.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("does nothing when entry does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              commit: createTestEntry({
                owner: "other",
                repo: "commit",
              }),
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          const result = yield* removeLockEntry(axmDir, "nonexistent");

          expect(result.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("persists changes to disk", () =>
      withFileSystem(
        Effect.gen(function* () {
          const initialLockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              "pr-review": createTestEntry(),
            },
          };
          yield* writeLockfile(axmDir, initialLockfile);

          yield* removeLockEntry(axmDir, "pr-review");

          const readResult = yield* readLockfile(axmDir);
          expect(readResult.skills["pr-review"]).toBeUndefined();
        }),
      ),
    );

    it.effect("works on empty lockfile", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* removeLockEntry(axmDir, "nonexistent");

          expect(result.lockfileVersion).toBe(1);
          expect(result.skills).toEqual({});
        }),
      ),
    );
  });

  describe("YAML format round-trip", () => {
    it.effect("preserves all fields through read/write cycle", () =>
      withFileSystem(
        Effect.gen(function* () {
          const entry: SkillLockEntry = {
            source: "github",
            owner: "example-org",
            repo: "agent-skills",
            ref: "main",
            path: "skills/pr-review",
            agents: ["claude-code", "cursor"],
            gitTreeHash: "abc123def456789012345678901234567890",
            installedAt: new Date("2026-01-28T10:00:00.000Z"),
            updatedAt: new Date("2026-01-28T12:30:00.000Z"),
          };
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              "pr-review": entry,
            },
          };

          yield* writeLockfile(axmDir, lockfile);
          const result = yield* readLockfile(axmDir);

          expect(result.lockfileVersion).toBe(1);
          const prReview = result.skills["pr-review"];
          expect(prReview?.source).toBe("github");
          if (prReview?.source === "github") {
            expect(prReview?.owner).toBe(entry.owner);
            expect(prReview?.repo).toBe(entry.repo);
            expect(prReview?.ref).toBe(entry.ref);
            expect(prReview?.path).toBe(entry.path);
          }
          expect(prReview?.agents).toEqual(entry.agents);
          expect(prReview?.gitTreeHash).toBe(entry.gitTreeHash);
          expect(prReview?.installedAt).toEqual(entry.installedAt);
          expect(prReview?.updatedAt).toEqual(entry.updatedAt);
        }),
      ),
    );

    it.effect("handles multiple skills", () =>
      withFileSystem(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 1,
            skills: {
              "pr-review": createTestEntry({
                owner: "org",
                repo: "pr-review",
              }),
              commit: createTestEntry({
                owner: "org",
                repo: "commit",
              }),
              "code-review": createTestEntry({
                owner: "org",
                repo: "code-review",
              }),
            },
          };

          yield* writeLockfile(axmDir, lockfile);
          const result = yield* readLockfile(axmDir);

          expect(Object.keys(result.skills)).toHaveLength(3);
          expect(result.skills["pr-review"]).toBeDefined();
          expect(result.skills["commit"]).toBeDefined();
          expect(result.skills["code-review"]).toBeDefined();
        }),
      ),
    );
  });
});
