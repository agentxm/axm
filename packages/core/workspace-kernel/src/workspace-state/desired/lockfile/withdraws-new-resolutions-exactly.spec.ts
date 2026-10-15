import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { withDocumentRoundTripBatch } from "../document-round-trip.js";
import {
  emitLockfileToml,
  LOCKFILE_VERSION,
  LockfileSchema,
  parseLockfileToml,
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
  source: { type: "path", path: "/sources/review" },
  identity: { owner: "@acme", name: "review" },
  resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
  treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
});

describe("accepted resolution round trips", () => {
  for (const [beforeValue, changedValue] of [
    ["2", "2.0"],
    ["-0.0", "0.0"],
    ["2026-10-15T06:30:00.123456Z", "2026-10-15T06:30:00.123457Z"],
  ]) {
    it.effect(
      `preserves intervening tool value changes from ${beforeValue} to ${changedValue}`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const runtimeDir = path.join(root, ".axm");
          const target = path.join(root, "axm.lock");
          yield* fs.makeDirectory(runtimeDir);
          yield* fs.writeFileString(
            target,
            `# original\nversion = 1\n[tool.audit]\nvalue = ${beforeValue}\n`,
          );
          const original = { lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile;
          const context = {
            nativeRoot: root,
            runtimeDir,
            eligible: true,
            locks: yield* WorkspaceFileWriteLocks,
          };
          yield* writeLockfileAtPath(target, { ...original, skills: { review: entry } }, context);
          const introduced = yield* fs.readFileString(target);
          yield* fs.writeFileString(
            target,
            introduced.replace(`value = ${beforeValue}`, `value = ${changedValue}`),
          );
          yield* writeLockfileAtPath(target, original, { ...context, eligible: false });
          const withdrawn = yield* fs.readFileString(target);
          expect(withdrawn).toContain(`value = ${changedValue}\n`);
          expect(parseLockfileToml(withdrawn).document).toEqual({ version: 1 });
        }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  for (const before of [undefined, "# prior\r\nversion = 1\r\n"]) {
    it.effect(
      `restores a precisely withdrawn multi-entry graph from ${before === undefined ? "absence" : "authored bytes"}`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const runtimeDir = path.join(root, ".axm");
          const target = path.join(root, "axm.lock");
          yield* fs.makeDirectory(runtimeDir);
          if (before !== undefined) yield* fs.writeFileString(target, before);
          const original = { lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile;
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
      const target = path.join(root, "axm.lock");
      yield* fs.makeDirectory(runtimeDir);
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: false,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile;
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
              resolved: { tree: `sha256-tree-v2:${"1".repeat(64)}` },
              treeIntegrity: `sha256-tree-v2:${"1".repeat(64)}`,
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
      const target = path.join(root, "axm.lock");
      yield* fs.makeDirectory(runtimeDir);
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: true,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile;
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

  // Every write emits the whole canonical document, so exact restoration is
  // owed to bytes AXM wrote (tool tables included) and to equivalent minimal
  // documents whose content the canonical document still carries.
  for (const before of [
    "version = 1\n",
    "version = 1\n\n",
    emitLockfileToml({ version: LOCKFILE_VERSION }),
    emitLockfileToml(
      { version: LOCKFILE_VERSION },
      parseLockfileToml("[tool.example]\nkept = true\n").tool,
    ),
  ]) {
    it.effect(`restores ${JSON.stringify(before)}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const runtimeDir = path.join(root, ".axm");
        const target = path.join(root, "axm.lock");
        yield* fs.makeDirectory(runtimeDir);
        yield* fs.writeFileString(target, before);
        const original = yield* Schema.decodeUnknownEffect(LockfileSchema)(
          parseLockfileToml(before).document,
        );
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
      const target = path.join(root, "axm.lock");
      yield* fs.makeDirectory(runtimeDir);
      yield* fs.writeFileString(target, "version = 1\n");
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: false,
        locks: yield* WorkspaceFileWriteLocks,
      };
      const original = { lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile;
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
      // No inverse applies to the edited bytes, so the write is the canonical document.
      expect(yield* fs.readFileString(target)).toBe(
        emitLockfileToml(Schema.encodeSync(LockfileSchema)(original)),
      );
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
