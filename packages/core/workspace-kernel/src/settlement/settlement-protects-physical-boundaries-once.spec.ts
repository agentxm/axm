import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";

import {
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
  runWorkspaceTransaction,
} from "./index.js";
import { WorkspaceTransactionScopeTest } from "./testing.js";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  readCopiedDirectory,
  retireCopiedDirectory,
} from "../locations/index.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/settlement-protects-physical-boundaries-once",
  title: "Settlement protects each physical boundary and preserves foreign changes",
  statement:
    "AXM shall restore a failed closure's physical preimages once, coalescing aliases and overlapping boundaries, only while each boundary still matches AXM's observed postimage, and shall preserve divergent foreign state with recovery evidence.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Real temporary files and aliases expose duplicate snapshots and foreign changes during failure restoration.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("physical restoration boundaries", () => {
  for (const change of ["outside alias", "replacement parent"] as const) {
    it.effect(`preserves a matching postimage reached through a foreign ${change}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temporary = yield* fs.makeTempDirectoryScoped();
        const root = path.join(temporary, "workspace");
        const directory = path.join(root, "native");
        const file = path.join(directory, "config.json");
        const moved = path.join(temporary, "foreign");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(file, "original");
        const originalIdentity = yield* fs.stat(file);
        const result = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          targets: [file],
          transition: Effect.gen(function* () {
            yield* fs.writeFileString(file, "AXM postimage");
            yield* recordFootprint({ path: file, change: "modified" });
            yield* fs.rename(directory, moved);
            if (change === "outside alias") yield* fs.symlink(moved, directory);
            else {
              yield* fs.makeDirectory(directory);
              yield* fs.rename(path.join(moved, "config.json"), file);
            }
            return yield* Effect.fail("later-step-failed");
          }),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            WorkspaceTransactionScopeTest({
              workspaceDir: path.join(root, ".axm"),
              settingsPath: path.join(root, "axm.json"),
              lockPath: path.join(root, "axm-lock.yaml"),
            }),
          ),
          Effect.result,
        );
        expect(yield* fs.readFileString(file)).toBe("AXM postimage");
        expect((yield* fs.stat(file)).ino).toEqual(originalIdentity.ino);
        if (change === "outside alias") expect(yield* fs.readLink(directory)).toBe(moved);
        if (
          result._tag !== "Failure" ||
          typeof result.failure === "string" ||
          result.failure._tag !== "WorkspaceRestorationIncomplete"
        )
          return expect.fail("Expected retained recovery after ancestor route divergence");
        expect(result.failure.retained).toContain("native/config.json");
        const recovery = result.failure.recovery.find((entry) => entry.originalPath === file);
        expect(recovery?.kind).toBe("snapshot");
        if (recovery !== undefined)
          expect(yield* fs.readFileString(recovery.recoveryPath)).toBe("original");
        if (result.failure.snapshotDir !== undefined)
          yield* fs.remove(result.failure.snapshotDir, { recursive: true });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("preserves a foreign sibling added beside a retained original", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, "original");
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: Effect.gen(function* () {
          yield* retireWorkspacePath(file);
          const storeName = (yield* fs.readDirectory(root)).find((name) =>
            name.startsWith(".axm-retired-"),
          );
          if (storeName === undefined) return expect.fail("Expected retained original");
          yield* fs.writeFileString(path.join(root, storeName, "personal.txt"), "keep");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure" && result.failure._tag === "WorkspaceRestorationIncomplete") {
        const original = result.failure.recovery.find((entry) => entry.kind === "retired-entry");
        expect(original).toBeDefined();
        if (original !== undefined) {
          expect(yield* fs.readFileString(original.recoveryPath)).toBe("original");
          expect(
            yield* fs.readFileString(
              path.join(path.dirname(original.recoveryPath), "personal.txt"),
            ),
          ).toBe("keep");
        }
        if (result.failure.snapshotDir !== undefined)
          yield* fs.remove(result.failure.snapshotDir, { recursive: true });
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports surviving original entries when a foreign postimage blocks restoration", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, "original");
      const originalIdentity = yield* fs.stat(file);
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: Effect.gen(function* () {
          yield* retireWorkspacePath(file);
          yield* fs.writeFileString(file, "foreign");
          return yield* Effect.fail("later-step-failed");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(file)).toBe("foreign");
      if (
        result._tag === "Failure" &&
        typeof result.failure !== "string" &&
        result.failure._tag === "WorkspaceRestorationIncomplete"
      ) {
        expect(result.failure.recovery.map((entry) => entry.kind).sort()).toEqual([
          "retired-entry",
          "snapshot",
        ]);
        for (const entry of result.failure.recovery) {
          expect(entry.originalPath).toBe(file);
          expect(yield* fs.readFileString(entry.recoveryPath)).toBe("original");
          if (entry.kind === "retired-entry") {
            expect((yield* fs.stat(entry.recoveryPath)).ino).toEqual(originalIdentity.ino);
            yield* fs.remove(path.dirname(entry.recoveryPath), { recursive: true });
          }
        }
        if (result.failure.snapshotDir !== undefined)
          yield* fs.remove(result.failure.snapshotDir, { recursive: true });
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("coalesces an initially absent leaf into its later protected absent parent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const directory = path.join(root, "mcps");
      const file = path.join(directory, "context", "mcp.json");
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        targets: [path.dirname(file)],
        transition: Effect.gen(function* () {
          yield* protectWorkspacePath(directory);
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, "{}");
          yield* recordFootprint({ path: path.dirname(file), change: "created" });
          return yield* Effect.fail("native-projection-refused");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe("native-projection-refused");
      expect(yield* fs.exists(directory)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const order of ["child-first", "parent-first"] as const) {
    it.effect(`restores aliased and overlapping paths with ${order} registration`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const directory = path.join(root, "native");
        const file = path.join(directory, "config");
        yield* fs.makeDirectory(directory);
        yield* fs.writeFileString(file, "before");
        yield* fs.symlink(directory, path.join(root, "alias"));
        const result = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            if (order === "parent-first") yield* protectWorkspacePath(directory);
            yield* protectWorkspacePath(file);
            yield* fs.writeFileString(file, "first-write");
            yield* recordFootprint({ path: file, change: "modified" });
            yield* protectWorkspacePath(path.join(root, "alias", "config"));
            if (order === "child-first") yield* protectWorkspacePath(directory);
            yield* fs.writeFileString(file, "second-write");
            yield* recordFootprint({ path: file, change: "modified" });
            return yield* Effect.fail("failed-step");
          }),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            WorkspaceTransactionScopeTest({
              workspaceDir: path.join(root, ".axm"),
              settingsPath: path.join(root, "axm.json"),
              lockPath: path.join(root, "axm-lock.yaml"),
            }),
          ),
          Effect.result,
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure).toBe("failed-step");
        expect(yield* fs.readFileString(file)).toBe("before");
        expect(yield* fs.readLink(path.join(root, "alias"))).toBe(directory);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("retains a foreign edit made after AXM wrote a shared file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, '{"foreign":1}');
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        targets: [file],
        transition: Effect.gen(function* () {
          yield* fs.writeFileString(file, '{"foreign":1,"managed":true}');
          yield* recordFootprint({ path: file, change: "modified" });
          yield* fs.writeFileString(file, '{"foreign":2,"managed":true}');
          return yield* Effect.fail("later-step");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (
        result._tag === "Failure" &&
        typeof result.failure !== "string" &&
        result.failure._tag === "WorkspaceRestorationIncomplete"
      ) {
        expect(result.failure.snapshotDir).toBeDefined();
        if (result.failure.snapshotDir !== undefined) {
          expect(yield* fs.exists(result.failure.snapshotDir)).toBe(true);
          yield* fs.remove(result.failure.snapshotDir, { recursive: true });
        }
      } else expect.fail("Expected incomplete restoration with preserved recovery evidence");
      expect(yield* fs.readFileString(file)).toBe('{"foreign":2,"managed":true}');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "restores an independent boundary while preserving foreign divergence in the same failed closure",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const foreign = path.join(root, "foreign.json");
        const independent = path.join(root, "independent.json");
        yield* fs.writeFileString(foreign, "foreign before");
        yield* fs.writeFileString(independent, "independent before");
        const result = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          targets: [foreign, independent],
          transition: Effect.gen(function* () {
            for (const file of [foreign, independent]) {
              yield* fs.writeFileString(file, "AXM postimage");
              yield* recordFootprint({ path: file, change: "modified" });
            }
            yield* fs.writeFileString(foreign, "foreign edit after AXM");
            return yield* Effect.fail("later-step");
          }),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            WorkspaceTransactionScopeTest({
              workspaceDir: path.join(root, ".axm"),
              settingsPath: path.join(root, "axm.json"),
              lockPath: path.join(root, "axm-lock.yaml"),
            }),
          ),
          Effect.result,
        );
        expect(yield* fs.readFileString(foreign)).toBe("foreign edit after AXM");
        expect(yield* fs.readFileString(independent)).toBe("independent before");
        if (
          result._tag !== "Failure" ||
          typeof result.failure === "string" ||
          result.failure._tag !== "WorkspaceRestorationIncomplete"
        )
          return expect.fail("Expected selective incomplete restoration");
        expect(result.failure.retained).toEqual(["foreign.json"]);
        const recovery = result.failure.recovery.find((entry) => entry.originalPath === foreign);
        expect(recovery?.kind).toBe("snapshot");
        if (recovery === undefined)
          return expect.fail("Expected original foreign boundary recovery");
        expect(yield* fs.readFileString(recovery.recoveryPath)).toBe("foreign before");
        if (result.failure.snapshotDir !== undefined)
          yield* fs.remove(result.failure.snapshotDir, { recursive: true });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does not absorb a foreign sibling into a later AXM child write", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const created = path.join(root, "new", "native");
      const owned = path.join(created, "managed");
      const foreign = path.join(created, "foreign");
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: Effect.gen(function* () {
          yield* protectCreatedAncestors(fs, path, created);
          yield* fs.makeDirectory(created, { recursive: true });
          yield* fs.writeFileString(owned, "first");
          yield* recordFootprint({ path: owned, change: "created" });
          yield* fs.writeFileString(foreign, "keep");
          yield* fs.writeFileString(owned, "second");
          yield* recordFootprint({ path: owned, change: "modified" });
          return yield* Effect.fail("later-step");
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure" && typeof result.failure !== "string")
        expect(result.failure._tag).toBe("WorkspaceRestorationIncomplete");
      else expect.fail("Expected refusal to erase a foreign child");
      expect(yield* fs.readFileString(foreign)).toBe("keep");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const whole of [false, true]) {
    it.effect(
      `preserves original filesystem identities after ${whole ? "whole-directory" : "per-entry"} retirement and rollback`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const directory = path.join(root, "native");
          const nested = path.join(directory, "nested");
          const file = path.join(nested, "owned");
          yield* fs.makeDirectory(nested, { recursive: true });
          yield* fs.writeFileString(file, "original");
          const originals = yield* Effect.forEach([directory, nested, file], (target) =>
            fs.stat(target),
          );
          const result = yield* runWorkspaceTransaction({
            claimDefaultTargets: false,
            transition: Effect.gen(function* () {
              if (whole) yield* retireWorkspacePath(directory);
              else {
                yield* retireWorkspacePath(file);
                yield* retireWorkspacePath(nested);
                yield* retireWorkspacePath(directory);
              }
              return yield* Effect.fail("later-step");
            }),
            validate: () => Effect.void,
          }).pipe(
            Effect.provide(
              WorkspaceTransactionScopeTest({
                workspaceDir: path.join(root, ".axm"),
                settingsPath: path.join(root, "axm.json"),
                lockPath: path.join(root, "axm-lock.yaml"),
              }),
            ),
            Effect.result,
          );
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") expect(result.failure).toBe("later-step");
          const restored = yield* Effect.forEach([directory, nested, file], (target) =>
            fs.stat(target),
          );
          expect(restored.map((entry) => [entry.dev, entry.ino, entry.birthtime])).toEqual(
            originals.map((entry) => [entry.dev, entry.ino, entry.birthtime]),
          );
          expect(yield* fs.readFileString(file)).toBe("original");
          expect(
            (yield* fs.readDirectory(root)).filter((name) => name.startsWith(".axm-retired-")),
          ).toEqual([]);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("discards retired originals only after a successful transition", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native");
      yield* fs.writeFileString(file, "original");
      yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: retireWorkspacePath(file).pipe(Effect.andThen(fs.exists(file))),
        validate: (present) =>
          Effect.gen(function* () {
            expect(present).toBe(false);
            expect(
              (yield* fs.readDirectory(root)).some((name) => name.startsWith(".axm-retired-")),
            ).toBe(true);
          }),
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
      );
      expect(yield* fs.exists(file)).toBe(false);
      expect(
        (yield* fs.readDirectory(root)).filter((name) => name.startsWith(".axm-retired-")),
      ).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps copied-directory ownership receipts valid after a failed removal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const directory = path.join(root, "native");
      const file = path.join(directory, "SKILL.md");
      yield* fs.makeDirectory(directory);
      yield* fs.writeFileString(file, "# Owned skill\n");
      const receipt = yield* captureCopiedDirectory(directory, path.join(root, "source"));
      expect(Option.isSome(receipt)).toBe(true);
      const before = yield* fs.readFileString(yield* copiedDirectoryReceiptPath(directory));
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: retireCopiedDirectory(directory, retireWorkspacePath).pipe(
          Effect.andThen(Effect.fail("later-step")),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide(
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm-lock.yaml"),
          }),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBe("later-step");
      expect(yield* fs.readFileString(yield* copiedDirectoryReceiptPath(directory))).toBe(before);
      expect(Option.isSome(yield* readCopiedDirectory(directory))).toBe(true);
      expect(yield* retireCopiedDirectory(directory)).toBe(true);
      expect(yield* fs.exists(directory)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
