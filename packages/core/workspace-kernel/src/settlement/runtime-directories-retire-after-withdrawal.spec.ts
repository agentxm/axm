import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  captureContainerIdentity,
  readContainerReceipts,
  recordContainerReceipt,
  updateContainerReceipts,
} from "../locations/index.js";
import {
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
  createdWorkspaceDirectories,
} from "./index.js";
import { makeWorkspaceTransactionScope } from "./live.js";

export const specification = defineSpecification({
  requirement: "workspace/settlement/runtime-directories-retire-after-withdrawal",
  title: "Runtime directory proof survives distinct admitted commands",
  statement:
    "A transition shall persist exclusively created runtime directories in the existing container receipt store, and the final withdrawing command shall remove them only after admission releases and continuous identity plus empty-only removal proves safety.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Distinct live process-lock instances and real directory identities exercise proof transfer and finalizer cleanup.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const workspaceDir = path.join(root, ".axm");
  const target = path.join(root, "owned.json");
  yield* fs.writeFileString(target, "{}");
  const receipt = {
    unit: "new-intent",
    kind: "inserted-key" as const,
    identity: yield* captureContainerIdentity({ nativeRoot: root, target }),
  };
  const mutation = {
    withLock: <A, E, R>(_target: string, effect: Effect.Effect<A, E, R>) => effect,
    inheritedDirectories: createdWorkspaceDirectories,
    createDirectory: (directory: string) =>
      fs.makeDirectory(directory).pipe(
        Effect.as(true),
        Effect.catch((cause) =>
          cause.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(cause),
        ),
      ),
    write: (file: string, content: string) =>
      Effect.gen(function* () {
        const existed = yield* fs.exists(file);
        yield* protectWorkspacePath(file);
        yield* fs.writeFileString(file, content);
        yield* recordFootprint({ path: file, change: existed ? "modified" : "created" });
      }),
    retire: retireWorkspacePath,
  };
  const command = <A, E, R>(transition: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const scope = yield* makeWorkspaceTransactionScope({
        workspaceDir,
        settingsPath: path.join(root, "axm.json"),
        lockPath: path.join(root, "axm-lock.yaml"),
      });
      return yield* scope.run({
        claimDefaultTargets: false,
        transition,
        validate: () => Effect.void,
      });
    });
  return {
    fs,
    path,
    root,
    workspaceDir,
    command,
    insert: recordContainerReceipt(workspaceDir, receipt, mutation),
    withdraw: updateContainerReceipts(workspaceDir, () => [], mutation),
  };
});

describe("runtime receipt handoff", () => {
  it.effect(
    "creates and retires an initially absent user workspace using its existing home identity",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped();
        const ownerRoot = path.join(home, ".axm", "workspace");
        const scope = yield* makeWorkspaceTransactionScope({
          workspaceDir: path.join(ownerRoot, ".axm"),
          settingsPath: path.join(ownerRoot, "axm.json"),
          lockPath: path.join(ownerRoot, "axm-lock.yaml"),
          nativeRoot: home,
        });
        yield* scope.run({
          claimDefaultTargets: false,
          transition: Effect.void,
          validate: () => Effect.void,
        });
        expect(yield* fs.readDirectory(home)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("removes an initially absent runtime after the last receipt in a later command", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.command(f.insert);
      const stored = yield* readContainerReceipts(f.workspaceDir);
      expect(
        stored.createdDirectories.some((identity) => identity.physicalPath === f.workspaceDir),
      ).toBe(true);
      expect(yield* f.fs.exists(f.path.join(f.workspaceDir, "tmp"))).toBe(false);
      yield* f.command(f.withdraw);
      expect(yield* f.fs.exists(f.workspaceDir)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps a preexisting empty runtime and scratch directory", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.fs.makeDirectory(f.path.join(f.workspaceDir, "tmp"), { recursive: true });
      const before = yield* f.fs.stat(f.workspaceDir);
      yield* f.command(f.insert);
      yield* f.command(f.withdraw);
      expect(Option.getOrUndefined((yield* f.fs.stat(f.workspaceDir)).ino)).toBe(
        Option.getOrUndefined(before.ino),
      );
      expect(yield* f.fs.readDirectory(f.workspaceDir)).toEqual(["tmp"]);
      expect(yield* f.fs.readDirectory(f.path.join(f.workspaceDir, "tmp"))).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves foreign additions after withdrawing the final receipt", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.command(f.insert);
      yield* f.fs.writeFileString(f.path.join(f.workspaceDir, "foreign.txt"), "keep");
      yield* f.command(f.withdraw);
      expect(yield* f.fs.readDirectory(f.workspaceDir)).toEqual(["foreign.txt"]);
      expect(yield* f.fs.readFileString(f.path.join(f.workspaceDir, "foreign.txt"))).toBe("keep");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not renew creation proof when a replacement runtime carries copied receipts",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        yield* f.command(f.insert);
        const retained = f.path.join(f.root, "old-runtime");
        yield* f.fs.rename(f.workspaceDir, retained);
        yield* f.fs.copy(retained, f.workspaceDir);
        yield* f.command(f.withdraw);
        expect(yield* f.fs.exists(f.workspaceDir)).toBe(true);
        expect(yield* f.fs.readDirectory(f.workspaceDir)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("restores absence after failed admitted work without persisting creation proof", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const result = yield* f
        .command(Effect.fail("injected-before-publication"))
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* f.fs.exists(f.workspaceDir)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
