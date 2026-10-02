import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { withDocumentRoundTripBatch } from "../document-round-trip.js";
import {
  LockfileSchema,
  SkillLockEntrySchema,
  writeLockfileAtPath,
  type Lockfile,
} from "../../index.js";
import { WorkspaceFileWriteLocks } from "../../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../../settlement/live.js";

export const specification = defineSpecification({
  requirement: "workspace/lockfile/withdraws-new-resolutions-exactly",
  title: "Withdrawing a newly reachable resolution restores its original lockfile bytes",
  statement:
    "When one newly reachable extension's accepted resolution is precisely withdrawn without intervening lockfile or identity changes, AXM shall restore the prior lockfile bytes. Repairing an already reachable identity shall not establish this cleanup authority; unavailable or stale evidence shall preserve unowned content.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Separate file publications and receipt reads expose exact lockfile bytes and physical identity.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const platform = WorkspaceFileWriteLocksLive.pipe(Layer.provideMerge(NodeServices.layer));
const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
  source: { type: "path", path: "../review" },
  identity: { owner: "@acme", name: "review" },
  resolved: { tree: "sha256-content" },
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
});

describe("accepted resolution round trips", () => {
  for (const before of [undefined, "# prior\r\nlockfileVersion: 9\r\nskills: {}"]) {
    it.effect(
      `restores a precisely withdrawn multi-entry graph from ${before === undefined ? "absence" : "authored bytes"}`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const runtimeDir = path.join(root, ".axm");
          const target = path.join(root, "axm-lock.yaml");
          yield* fs.makeDirectory(runtimeDir);
          if (before !== undefined) yield* fs.writeFileString(target, before);
          const original = { lockfileVersion: 9, skills: {} } satisfies Lockfile;
          const first = { ...original, skills: { review: entry } };
          const second = { ...original, skills: { review: entry, docs: entry } };
          const context = {
            nativeRoot: root,
            runtimeDir,
            eligible: false,
            locks: yield* WorkspaceFileWriteLocks,
          };
          yield* withDocumentRoundTripBatch(
            Effect.gen(function* () {
              yield* writeLockfileAtPath(target, first, context);
              yield* writeLockfileAtPath(target, second, context);
            }),
            { identity: "@acme/packs/workflow", mode: "introduce" },
          );
          yield* withDocumentRoundTripBatch(
            Effect.gen(function* () {
              yield* writeLockfileAtPath(target, first, context);
              yield* writeLockfileAtPath(target, original, context);
            }),
            { identity: "@acme/packs/workflow", mode: "withdraw" },
          );
          if (before === undefined) expect(yield* fs.exists(target)).toBe(false);
          else expect(yield* fs.readFileString(target)).toBe(before);
          expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
        }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("does not continue a graph receipt across a later source update", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const runtimeDir = path.join(root, ".axm");
      const target = path.join(root, "axm-lock.yaml");
      yield* fs.makeDirectory(runtimeDir);
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: false,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: 9, skills: {} } satisfies Lockfile;
      yield* withDocumentRoundTripBatch(
        writeLockfileAtPath(target, { ...original, skills: { review: entry } }, context),
        { identity: "@acme/packs/workflow", mode: "introduce" },
      );
      yield* writeLockfileAtPath(
        target,
        {
          ...original,
          skills: {
            review: Schema.decodeUnknownSync(SkillLockEntrySchema)({
              ...entry,
              resolved: { tree: "updated" },
            }),
          },
        },
        context,
      );
      yield* withDocumentRoundTripBatch(writeLockfileAtPath(target, original, context), {
        identity: "@acme/packs/workflow",
        mode: "withdraw",
      });
      expect(yield* fs.exists(target)).toBe(true);
      expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("retires an absent-before lockfile only with eligible creation proof", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const runtimeDir = path.join(root, ".axm");
      const target = path.join(root, "axm-lock.yaml");
      yield* fs.makeDirectory(runtimeDir);
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: true,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: 9, skills: {} } satisfies Lockfile;
      yield* writeLockfileAtPath(target, { ...original, skills: { review: entry } }, context);
      yield* writeLockfileAtPath(target, original, { ...context, eligible: false });
      expect(yield* fs.exists(target)).toBe(false);
      expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      yield* writeLockfileAtPath(
        target,
        { ...original, skills: { review: entry } },
        { ...context, eligible: false },
      );
      yield* writeLockfileAtPath(target, original, { ...context, eligible: false });
      expect(yield* fs.exists(target)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const before of [
    "lockfileVersion: 9\nskills: {}\n",
    "# authored\r\nlockfileVersion: 9\r\nskills: {}",
    "skills: {}\nlockfileVersion: 9\n\n",
    "lockfileVersion: 9\nskills: {}\nsubagents: {}\n",
  ]) {
    it.effect(`restores ${JSON.stringify(before)}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const runtimeDir = path.join(root, ".axm");
        const target = path.join(root, "axm-lock.yaml");
        yield* fs.makeDirectory(runtimeDir);
        yield* fs.writeFileString(target, before);
        const original = yield* Schema.decodeUnknownEffect(LockfileSchema)(YAML.parse(before));
        const context = {
          nativeRoot: root,
          runtimeDir,
          eligible: true,
          locks: yield* WorkspaceFileWriteLocks,
        };
        yield* writeLockfileAtPath(target, { ...original, skills: { review: entry } }, context);
        expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(true);
        yield* writeLockfileAtPath(
          target,
          { ...original, skills: {} },
          { ...context, eligible: false },
        );
        expect(yield* fs.readFileString(target)).toBe(before);
        expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("does not grant inverse authority to repair, or after an unrelated edit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const runtimeDir = path.join(root, ".axm");
      const target = path.join(root, "axm-lock.yaml");
      yield* fs.makeDirectory(runtimeDir);
      yield* fs.writeFileString(target, "lockfileVersion: 9\nskills: {}\n");
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: false,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: 9, skills: {} } satisfies Lockfile;
      yield* writeLockfileAtPath(target, { ...original, skills: { review: entry } }, context);
      expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      yield* writeLockfileAtPath(target, original, context);
      yield* writeLockfileAtPath(
        target,
        { ...original, skills: { review: entry } },
        { ...context, eligible: true },
      );
      yield* fs.writeFileString(target, `${yield* fs.readFileString(target)}# later edit\n`);
      yield* writeLockfileAtPath(target, original, context);
      expect(yield* fs.readFileString(target)).toContain("# later edit");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
