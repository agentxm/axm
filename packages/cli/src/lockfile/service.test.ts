/**
 * Unit tests for LockfileService.
 *
 * Tests query methods (getSkills, getEntry), mutation methods
 * (updateEntry, removeEntry), auto-creation of axm-lock.yaml,
 * semaphore serialization, and path resolution from Workspace.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Workspace, type WorkspaceContextService } from "../workspace/service.js";
import type { SkillLockEntry } from "./schema.js";
import { LOCKFILE_NAME } from "./lockfile.js";
import { LockfileService, LockfileServiceLive } from "./service.js";
import YAML from "yaml";

describe("LockfileService", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-service-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Write an axm-lock.yaml file to the test .axm directory. */
  const initLockfile = (skills: Record<string, unknown>): void => {
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(
      path.join(axmDir, LOCKFILE_NAME),
      YAML.stringify({ lockfileVersion: 1, skills }),
    );
  };

  /** Read axm-lock.yaml from disk for verification. */
  const readLockfileFromDisk = () =>
    YAML.parse(fs.readFileSync(path.join(axmDir, LOCKFILE_NAME), "utf-8")) as {
      lockfileVersion: number;
      skills: Record<string, unknown>;
    };

  /** Create a test layer with a mock Workspace pointing at the temp .axm dir. */
  const makeTestLayer = (dir: string) => {
    const mockWs: WorkspaceContextService = {
      global: false,
      path: dir,
      nonInteractive: true,
      preview: false,
      resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
      getSources: () => Effect.succeed([]),
      getSourceByName: () => Effect.succeed(Option.none()),
      getRegistrySources: () => Effect.succeed([]),
      getScope: () => Effect.succeed("@community"),
      addSource: () => Effect.void,
    };
    return Layer.provide(
      LockfileServiceLive,
      Layer.merge(NodeContext.layer, Workspace.layer(mockWs)),
    );
  };

  /** Create a sample lock entry for testing. */
  const makeSampleEntry = (agents: readonly string[] = ["claude-code"]): SkillLockEntry => ({
    source: "github" as const,
    owner: "acme",
    repo: "code-review",
    agents: [...agents],
    installedAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  });

  describe("getSkills", () => {
    it.effect("returns skills map when skills are present", () =>
      Effect.gen(function* () {
        initLockfile({
          "code-review": {
            source: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const service = yield* LockfileService;
        const skills = yield* service.getSkills();

        expect(Object.keys(skills)).toEqual(["code-review"]);
        expect(skills["code-review"]?.source).toBe("github");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("returns empty record when no skills", () =>
      Effect.gen(function* () {
        initLockfile({});

        const service = yield* LockfileService;
        const skills = yield* service.getSkills();

        expect(skills).toEqual({});
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("getEntry", () => {
    it.effect("returns Option.some when skill exists", () =>
      Effect.gen(function* () {
        initLockfile({
          "code-review": {
            source: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const service = yield* LockfileService;
        const entry = yield* service.getEntry("code-review");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.source).toBe("github");
        }
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("returns Option.none when skill does not exist", () =>
      Effect.gen(function* () {
        initLockfile({});

        const service = yield* LockfileService;
        const entry = yield* service.getEntry("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("updateEntry", () => {
    it.effect("adds a new skill entry and persists to disk", () =>
      Effect.gen(function* () {
        initLockfile({});

        const service = yield* LockfileService;
        yield* service.updateEntry("code-review", makeSampleEntry());

        const lockfile = readLockfileFromDisk();
        expect(lockfile.skills).toHaveProperty("code-review");
        expect((lockfile.skills["code-review"] as { source: string }).source).toBe("github");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("updates an existing skill entry", () =>
      Effect.gen(function* () {
        initLockfile({
          "code-review": {
            source: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const service = yield* LockfileService;
        yield* service.updateEntry("code-review", makeSampleEntry(["claude-code", "cursor"]));

        const lockfile = readLockfileFromDisk();
        expect((lockfile.skills["code-review"] as { agents: string[] }).agents).toEqual([
          "claude-code",
          "cursor",
        ]);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("sets updatedAt to current time", () =>
      Effect.gen(function* () {
        initLockfile({});

        const before = new Date();
        const service = yield* LockfileService;
        yield* service.updateEntry("code-review", makeSampleEntry());
        const after = new Date();

        const lockfile = readLockfileFromDisk();
        const updatedAt = new Date(
          (lockfile.skills["code-review"] as { updatedAt: string }).updatedAt,
        );
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("concurrent updateEntry calls do not lose data", () =>
      Effect.gen(function* () {
        initLockfile({});

        const service = yield* LockfileService;

        yield* Effect.all(
          [
            service.updateEntry("skill-a", makeSampleEntry()),
            service.updateEntry("skill-b", makeSampleEntry()),
          ],
          { concurrency: "unbounded" },
        );

        const lockfile = readLockfileFromDisk();
        expect(lockfile.skills).toHaveProperty("skill-a");
        expect(lockfile.skills).toHaveProperty("skill-b");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("removeEntry", () => {
    it.effect("removes an existing entry and persists to disk", () =>
      Effect.gen(function* () {
        initLockfile({
          "code-review": {
            source: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "test-gen": {
            source: "local",
            path: "/tmp/test-gen",
            agents: ["cursor"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const service = yield* LockfileService;
        yield* service.removeEntry("code-review");

        const lockfile = readLockfileFromDisk();
        expect(lockfile.skills).not.toHaveProperty("code-review");
        expect(lockfile.skills).toHaveProperty("test-gen");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("no-op when skill does not exist", () =>
      Effect.gen(function* () {
        initLockfile({
          "test-gen": {
            source: "local",
            path: "/tmp/test-gen",
            agents: ["cursor"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const service = yield* LockfileService;
        yield* service.removeEntry("nonexistent");

        // File should be unchanged
        const lockfile = readLockfileFromDisk();
        expect(lockfile.skills).toHaveProperty("test-gen");
        expect(Object.keys(lockfile.skills)).toHaveLength(1);
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("auto-creation", () => {
    it.effect("returns empty skills when lockfile does not exist on first query", () =>
      Effect.gen(function* () {
        // Ensure .axm dir exists but no lockfile
        fs.mkdirSync(axmDir, { recursive: true });

        const service = yield* LockfileService;
        const skills = yield* service.getSkills();

        expect(skills).toEqual({});
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );

    it.effect("creates lockfile on first mutation when it does not exist", () =>
      Effect.gen(function* () {
        fs.mkdirSync(axmDir, { recursive: true });

        const service = yield* LockfileService;
        yield* service.updateEntry("code-review", makeSampleEntry());

        expect(fs.existsSync(path.join(axmDir, LOCKFILE_NAME))).toBe(true);
        const lockfile = readLockfileFromDisk();
        expect(lockfile.skills).toHaveProperty("code-review");
      }).pipe(Effect.provide(makeTestLayer(axmDir))),
    );
  });

  describe("path resolution", () => {
    it.effect("uses Workspace.path to determine lockfile location", () =>
      Effect.gen(function* () {
        const customAxmDir = path.join(tempDir, "custom-workspace");
        fs.mkdirSync(customAxmDir, { recursive: true });
        fs.writeFileSync(
          path.join(customAxmDir, LOCKFILE_NAME),
          YAML.stringify({
            lockfileVersion: 1,
            skills: {
              "custom-skill": {
                source: "local",
                path: "/tmp/custom",
                agents: ["claude-code"],
                installedAt: "2025-01-01T00:00:00.000Z",
                updatedAt: "2025-01-01T00:00:00.000Z",
              },
            },
          }),
        );

        const service = yield* LockfileService;
        const skills = yield* service.getSkills();

        expect(skills).toHaveProperty("custom-skill");
      }).pipe(Effect.provide(makeTestLayer(path.join(tempDir, "custom-workspace")))),
    );
  });
});
