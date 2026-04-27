import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import type { Lockfile, SkillLockEntry } from "./schema.js";
import { writeLockfile } from "./lockfile.js";

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

  const createTestEntry = (
    overrides?: Partial<Extract<SkillLockEntry, { readonly type: "github" }>>,
  ): SkillLockEntry & { type: "github" } => ({
    type: "github",
    owner: "example-org",
    repo: "agent-skills",
    agents: ["claude-code"],
    installedAt: new Date("2026-01-28T10:00:00.000Z"),
    updatedAt: new Date("2026-01-28T10:00:00.000Z"),
    ...overrides,
  });

  describe("writeLockfile", () => {
    it.effect("creates directory if it does not exist", () =>
      withContext(
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
      withContext(
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

          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
          expect(result.skills["commit"]).toBeDefined();
        }),
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
          const result = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));

          expect(result.lockfileVersion).toBe(1);
          const prReview = result.skills["pr-review"];
          expect(prReview?.type).toBe("github");
          if (prReview?.type === "github") {
            expect(prReview?.owner).toBe(entry.owner);
            expect(prReview?.repo).toBe(entry.repo);
            expect(prReview?.ref).toBe(entry.ref);
            expect(prReview?.path).toBe(entry.path);
          }
          expect(prReview?.agents).toEqual(entry.agents);
          expect(prReview?.gitTreeHash).toBe(entry.gitTreeHash);
          expect(prReview?.installedAt).toBe(entry.installedAt.toISOString());
          expect(prReview?.updatedAt).toBe(entry.updatedAt.toISOString());
        }),
      ),
    );

    it.effect("handles multiple skills", () =>
      withContext(
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
