import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { LOCKFILE_VERSION } from "../desired/lockfile/schema.js";
import { readLockfileCell, readSettingsCell, type StateCellPaths } from "./state-cells.js";

it.effect("reads fresh scoped documents without inspecting unrelated directories", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const projectRoot = makeAbsolutePath(path, path.join(root, "project"));
    const userHome = makeAbsolutePath(path, path.join(root, "home"));
    const userWorkspace = path.join(userHome, ".axm", "workspace");
    yield* fs.makeDirectory(projectRoot);
    yield* fs.makeDirectory(path.join(projectRoot, "skills"));
    yield* fs.makeDirectory(userWorkspace, { recursive: true });
    const projectSettings = path.join(projectRoot, "axm.json");
    const projectLock = path.join(projectRoot, "axm-lock.yaml");
    yield* fs.writeFileString(projectSettings, JSON.stringify({ agents: ["codex"] }));
    yield* fs.writeFileString(
      path.join(userWorkspace, "axm.json"),
      JSON.stringify({ agents: ["claude-code"] }),
    );
    yield* fs.writeFileString(
      projectLock,
      JSON.stringify({ lockfileVersion: LOCKFILE_VERSION, skills: {} }),
    );
    const cells = {
      scope: "project",
      nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      projectRoot,
      userHome,
      projectRuntimeDir: path.join(projectRoot, ".axm"),
      userRuntimeDir: path.join(userWorkspace, ".axm"),
    } satisfies StateCellPaths;
    const documentFs = {
      ...fs,
      readDirectory: () => Effect.die("Document reads must not enumerate unrelated directories"),
    } satisfies FileSystem.FileSystem;
    const project = readSettingsCell(cells, cells.projectRuntimeDir).pipe(
      Effect.provideService(FileSystem.FileSystem, documentFs),
    );
    const user = readSettingsCell(cells, cells.userRuntimeDir).pipe(
      Effect.provideService(FileSystem.FileSystem, documentFs),
    );
    const lock = readLockfileCell(cells, cells.projectRuntimeDir).pipe(
      Effect.provideService(FileSystem.FileSystem, documentFs),
    );
    expect(Option.getOrThrow(yield* project).agents).toEqual(["codex"]);
    expect(Option.getOrThrow(yield* user).agents).toEqual(["claude-code"]);
    expect((yield* lock).lockfileVersion).toBe(LOCKFILE_VERSION);

    yield* fs.writeFileString(projectSettings, JSON.stringify({ agents: [] }));
    yield* fs.writeFileString(
      projectLock,
      JSON.stringify({ lockfileVersion: LOCKFILE_VERSION - 1, skills: {} }),
    );
    expect(Option.getOrThrow(yield* project).agents).toEqual([]);
    expect(Option.getOrThrow(yield* user).agents).toEqual(["claude-code"]);
    expect(yield* Effect.flip(lock)).toMatchObject({
      _tag: "LockfileVersionUnsupported",
      observedVersion: LOCKFILE_VERSION - 1,
    });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
