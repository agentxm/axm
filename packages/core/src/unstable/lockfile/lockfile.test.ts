import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import YAML from "yaml";
import { LockfileSchema, type Lockfile, type SkillLockEntry } from "./schema.js";
import {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileUpdates,
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

  const withContext = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  const tempNames = (): ReadonlyArray<string> =>
    fs.existsSync(axmDir)
      ? fs.readdirSync(axmDir).filter((entry) => entry.startsWith("axm-lock.yaml.tmp."))
      : [];

  const createTestEntry = (
    overrides?: Partial<Extract<SkillLockEntry, { readonly type: "github" }>>,
  ): SkillLockEntry & { type: "github" } => ({
    type: "github",
    owner: "example-org",
    repo: "agent-skills",
    installedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
    updatedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
    ...overrides,
  });

  describe("writeLockfile", () => {
    it.effect("creates directory if it does not exist", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {},
          };

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.existsSync(axmDir)).toBe(true);
        }),
      ),
    );

    it.effect("writes lockfile in YAML format", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              "pr-review": createTestEntry(),
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const content = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
          const parsed = YAML.parse(content);
          expect(parsed.lockfileVersion).toBe(3);
          expect(parsed.skills["pr-review"]).toBeDefined();
          expect(parsed.skills["pr-review"].type).toBe("github");
          expect(parsed.skills["pr-review"].owner).toBe("example-org");
          expect(parsed.skills["pr-review"].repo).toBe("agent-skills");
        }),
      ),
    );

    it.effect("overwrites existing lockfile", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "axm-lock.yaml"),
            YAML.stringify({ lockfileVersion: 3, skills: {} }),
          );

          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              commit: createTestEntry({
                owner: "other",
                repo: "repo",
              }),
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(result.skills["commit"]).toBeDefined();
        }),
      ),
    );

    it.effect("removes the temp file when the atomic rename fails", () =>
      Effect.gen(function* () {
        const realFs = yield* FileSystem.FileSystem;
        const failingFs: FileSystem.FileSystem = {
          ...realFs,
          rename: (oldPath, newPath) =>
            newPath.endsWith("axm-lock.yaml") && oldPath.includes("axm-lock.yaml.tmp.")
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "Unknown",
                    module: "FileSystem",
                    method: "rename",
                    pathOrDescriptor: oldPath,
                  }),
                )
              : realFs.rename(oldPath, newPath),
        };
        const lockfile: Lockfile = {
          lockfileVersion: 3,
          skills: {
            "pr-review": createTestEntry(),
          },
        };

        const result = yield* writeLockfile(axmDir, lockfile).pipe(
          Effect.provide(Layer.succeed(FileSystem.FileSystem, failingFs)),
          Effect.result,
        );

        expect(result._tag).toBe("Failure");
        expect(tempNames()).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("sweeps stale temp files before writing", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml.tmp.old.bad123"), "stale");
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              "pr-review": createTestEntry(),
            },
          };

          yield* writeLockfile(axmDir, lockfile);

          expect(tempNames()).toEqual([]);
        }),
      ),
    );

    it.effect("keeps the YAML bytes identical to the existing encoder output", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              "pr-review": createTestEntry(),
            },
          };
          const baseline = YAML.stringify(Schema.encodeSync(LockfileSchema)(lockfile));

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8")).toBe(baseline);
        }),
      ),
    );

    it.effect("does not replace an unchanged lockfile", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              "pr-review": createTestEntry(),
            },
          };
          const lockfilePath = path.join(axmDir, "axm-lock.yaml");
          const unchangedTimestamp = new Date("2020-01-01T00:00:00.000Z");

          yield* writeLockfile(axmDir, lockfile);
          const bytesBefore = fs.readFileSync(lockfilePath);
          fs.utimesSync(lockfilePath, unchangedTimestamp, unchangedTimestamp);

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.readFileSync(lockfilePath)).toEqual(bytesBefore);
          expect(fs.statSync(lockfilePath).mtimeMs).toBe(unchangedTimestamp.getTime());
        }),
      ),
    );
  });

  describe("batched updates", () => {
    it.effect("preserves the knowledge lock map across a snapshot patch", () =>
      withContext(
        Effect.gen(function* () {
          const knowledgeEntry = {
            type: "github" as const,
            owner: "example-org",
            repo: "knowledge-repo",
            installedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
          };
          // On-disk lockfile already carries a knowledge entry.
          const onDisk: Lockfile = {
            lockfileVersion: 3,
            skills: {},
            knowledge: { "team/handbook": knowledgeEntry },
          };
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "axm-lock.yaml"),
            YAML.stringify(Schema.encodeSync(LockfileSchema)(onDisk)),
          );

          // A snapshot update that only touches skills, never knowledge.
          const base: Lockfile = { lockfileVersion: 3, skills: {} };
          const next: Lockfile = {
            lockfileVersion: 3,
            skills: { "pr-review": createTestEntry() },
          };
          yield* commitLockfileSnapshotUpdate(axmDir, base, next);

          const written = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(written.knowledge).toBeDefined();
          expect(written.knowledge["team/handbook"]).toBeDefined();
          expect(written.skills["pr-review"]).toBeDefined();
        }),
      ),
    );

    it("applies lockfile updates in order without writing", () => {
      const lockfile: Lockfile = {
        lockfileVersion: 3,
        skills: {},
        files: {},
      };

      const updated = applyLockfileUpdates(lockfile, [
        (current) => ({
          ...current,
          files: {
            ...current.files,
            baseline: {
              type: "local",
              path: "./files/baseline",
              installedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
              resolvedInputs: {},
            },
          },
        }),
        (current) => {
          const baseline = current.files?.["baseline"];
          if (baseline === undefined) return current;
          return {
            ...current,
            files: {
              ...current.files,
              baseline: {
                ...baseline,
                resolvedInputs: { projectName: "AgentXM" },
              },
            },
          };
        },
      ]);

      expect(updated.files?.["baseline"]?.resolvedInputs).toEqual({ projectName: "AgentXM" });
      expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(false);
    });

    it.effect("commits batched lockfile updates with one write", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {},
            files: {},
          };

          yield* commitLockfileUpdates(axmDir, lockfile, [
            (current) => ({
              ...current,
              files: {
                ...current.files,
                baseline: {
                  type: "local",
                  path: "./files/baseline",
                  installedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
                  updatedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
                  resolvedInputs: { projectName: "AgentXM" },
                },
              },
            }),
          ]);

          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(result.files.baseline.resolvedInputs.projectName).toBe("AgentXM");
        }),
      ),
    );

    it.effect("rereads under the lock so concurrent stale-base updates preserve both entries", () =>
      withContext(
        Effect.gen(function* () {
          const staleBase: Lockfile = {
            lockfileVersion: 3,
            skills: {},
          };

          yield* Effect.all(
            [
              commitLockfileUpdates(axmDir, staleBase, [
                (current) => ({
                  ...current,
                  skills: {
                    ...current.skills,
                    alpha: createTestEntry({ repo: "alpha" }),
                  },
                }),
              ]),
              commitLockfileUpdates(axmDir, staleBase, [
                (current) => ({
                  ...current,
                  skills: {
                    ...current.skills,
                    beta: createTestEntry({ repo: "beta" }),
                  },
                }),
              ]),
            ],
            { concurrency: "unbounded" },
          );

          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(result.lockfileVersion).toBe(3);
          expect(Object.keys(result.skills).sort()).toEqual(["alpha", "beta"]);
          expect(tempNames()).toEqual([]);
        }),
      ),
    );

    it.effect("commits snapshot diffs without dropping independent fresh entries", () =>
      withContext(
        Effect.gen(function* () {
          const base: Lockfile = {
            lockfileVersion: 3,
            skills: {
              base: createTestEntry({ repo: "base" }),
            },
          };
          yield* writeLockfile(axmDir, base);

          const firstNext: Lockfile = {
            ...base,
            skills: {
              ...base.skills,
              alpha: createTestEntry({ repo: "alpha" }),
            },
          };
          const secondNext: Lockfile = {
            ...base,
            skills: {
              beta: createTestEntry({ repo: "beta" }),
            },
          };

          yield* commitLockfileSnapshotUpdate(axmDir, base, firstNext);
          yield* commitLockfileSnapshotUpdate(axmDir, base, secondNext);

          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(Object.keys(result.skills).sort()).toEqual(["alpha", "beta"]);
        }),
      ),
    );

    it.effect("breaks a stale advisory lock and releases its own lock", () =>
      withContext(
        Effect.gen(function* () {
          fs.mkdirSync(axmDir, { recursive: true });
          const lockPath = path.join(axmDir, "axm-lock.yaml.lock");
          fs.writeFileSync(lockPath, "stale");
          // Age the lock relative to the effect clock, which drives staleness.
          const staleAt = DateTime.toDateUtc(
            DateTime.subtractDuration(yield* DateTime.now, Duration.seconds(60)),
          );
          fs.utimesSync(lockPath, staleAt, staleAt);

          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {},
          };

          yield* writeLockfile(axmDir, lockfile);

          expect(fs.existsSync(lockPath)).toBe(false);
          expect(tempNames()).toEqual([]);
        }),
      ),
    );

    it.effect("waits for an active advisory lock before writing", () =>
      withContext(
        Effect.scoped(
          Effect.gen(function* () {
            fs.mkdirSync(axmDir, { recursive: true });
            const lockPath = path.join(axmDir, "axm-lock.yaml.lock");
            fs.writeFileSync(lockPath, "active");

            const lockfile: Lockfile = {
              lockfileVersion: 3,
              skills: {
                "pr-review": createTestEntry(),
              },
            };

            const fiber = yield* Effect.forkChild(writeLockfile(axmDir, lockfile));
            yield* TestClock.adjust("10 millis");

            expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(false);
            fs.rmSync(lockPath);

            yield* TestClock.adjust("50 millis");
            yield* Fiber.join(fiber);

            expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(true);
            expect(fs.existsSync(lockPath)).toBe(false);
            expect(tempNames()).toEqual([]);
          }),
        ),
      ),
    );
  });

  describe("YAML format round-trip", () => {
    it.effect("preserves all fields through read/write cycle", () =>
      withContext(
        Effect.gen(function* () {
          const entry: SkillLockEntry = {
            type: "github",
            owner: "example-org",
            repo: "agent-skills",
            ref: "main",
            path: "skills/pr-review",
            gitTreeHash: "abc123def456789012345678901234567890",
            installedAt: DateTime.makeUnsafe("2026-01-28T10:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2026-01-28T12:30:00.000Z"),
          };
          const lockfile: Lockfile = {
            lockfileVersion: 3,
            skills: {
              "pr-review": entry,
            },
          };

          yield* writeLockfile(axmDir, lockfile);
          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));

          expect(result.lockfileVersion).toBe(3);
          const prReview = result.skills["pr-review"];
          expect(prReview?.type).toBe("github");
          if (prReview?.type === "github") {
            expect(prReview?.owner).toBe(entry.owner);
            expect(prReview?.repo).toBe(entry.repo);
            expect(prReview?.ref).toBe(entry.ref);
            expect(prReview?.path).toBe(entry.path);
          }
          expect(prReview?.gitTreeHash).toBe(entry.gitTreeHash);
          expect(prReview?.installedAt).toBe(DateTime.formatIso(entry.installedAt));
          expect(prReview?.updatedAt).toBe(DateTime.formatIso(entry.updatedAt));
        }),
      ),
    );

    it.effect("handles multiple skills", () =>
      withContext(
        Effect.gen(function* () {
          const lockfile: Lockfile = {
            lockfileVersion: 3,
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
          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));

          expect(Object.keys(result.skills)).toHaveLength(3);
          expect(result.skills["pr-review"]).toBeDefined();
          expect(result.skills["commit"]).toBeDefined();
          expect(result.skills["code-review"]).toBeDefined();
        }),
      ),
    );
  });
});
