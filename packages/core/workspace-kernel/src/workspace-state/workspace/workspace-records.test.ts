/**
 * Document reads of one records call over a real temporary project workspace.
 * The workspace-state services run over a recording filesystem port, so each
 * count is the physical work the call performs.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { OfflineHttpClient, RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { NativeEntryRemovalLive } from "../../locations/live.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { LOCKFILE_VERSION, LockfileSchema } from "../desired/lockfile/schema.js";
import { emitLockfileToml } from "../desired/lockfile/toml.js";
import { WorkspaceStateLive } from "../live.js";
import { handle } from "../testing.js";
import { AcceptedResolutionWriter } from "./accepted-resolution-writer.js";
import { withWorkspaceReadView } from "./read-view.js";
import { makeRegistrySkillLockEntry } from "./test-stubs.js";
import { WorkspaceRecords } from "./workspace-records.js";

/** A project that declares and accepts one Registry skill whose package is installed. */
const makeProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "axm-records-" }));
  const settingsPath = path.join(root, "axm.json");
  const lockPath = path.join(root, "axm.lock");
  yield* fs.writeFileString(
    settingsPath,
    JSON.stringify({ skills: { review: "agentxm:@acme/skills/review@^1.0.0" } }),
  );
  yield* fs.writeFileString(
    lockPath,
    emitLockfileToml(
      Schema.encodeSync(LockfileSchema)({
        lockfileVersion: LOCKFILE_VERSION,
        skills: { review: makeRegistrySkillLockEntry({ owner: handle("@acme"), name: "review" }) },
      }),
    ),
  );
  const canonical = path.join(root, "agent_extensions", "registry.agentxm.ai", "@acme", "skills");
  yield* fs.makeDirectory(path.join(canonical, "review"), { recursive: true });
  yield* fs.writeFileString(path.join(canonical, "review", "SKILL.md"), "# Review\n");
  const state = WorkspaceStateLive({
    projectRoot: decodeAbsolutePathSync(root),
    scope: "project",
  }).pipe(
    Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({ env: { AXM_USER_HOME: path.join(root, "home") } }),
      ),
    ),
    Layer.provide(Layer.merge(WorkspaceFileWriteLocksLive, NativeEntryRemovalLive)),
  );
  return { settingsPath, lockPath, state };
});

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | FileSystemRecorder | Scope.Scope>,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

describe("one records call", () => {
  it.effect("outside a read phase reads the lockfile for its evaluation and its read model", () =>
    run(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const { settingsPath, lockPath, state } = yield* makeProject;
        const rows = yield* Effect.gen(function* () {
          const records = yield* WorkspaceRecords;
          recording.reset();
          return yield* records.rows("skill");
        }).pipe(Effect.provide(state));
        expect(rows.map((row) => [row.name, row.installed])).toEqual([["review", true]]);
        expect({
          lockReads: recording.contentReads(lockPath),
          lockProbes: recording.counts(lockPath).access ?? 0,
          settingsReads: recording.contentReads(settingsPath),
        }).toEqual({ lockReads: 2, lockProbes: 2, settingsReads: 2 });
      }),
    ),
  );

  it.effect("inside an accepted-resolution batch reads only the persisted lockfile", () =>
    run(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const { lockPath, state } = yield* makeProject;
        const rows = yield* Effect.gen(function* () {
          const records = yield* WorkspaceRecords;
          const writer = yield* AcceptedResolutionWriter;
          return yield* writer.withBatch(
            Effect.gen(function* () {
              recording.reset();
              return yield* records.rows("skill");
            }),
          );
        }).pipe(Effect.provide(state));
        expect(rows.map((row) => [row.name, row.installed])).toEqual([["review", true]]);
        expect(recording.contentReads(lockPath)).toBe(1);
      }),
    ),
  );

  it.effect("inside a read view reads each document once", () =>
    run(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const { settingsPath, lockPath, state } = yield* makeProject;
        const rows = yield* Effect.gen(function* () {
          recording.reset();
          return yield* withWorkspaceReadView(
            Effect.gen(function* () {
              return yield* (yield* WorkspaceRecords).rows("skill");
            }),
          );
        }).pipe(Effect.provide(state));
        expect(rows.map((row) => [row.name, row.installed])).toEqual([["review", true]]);
        expect({
          lockReads: recording.contentReads(lockPath),
          settingsReads: recording.contentReads(settingsPath),
        }).toEqual({ lockReads: 1, settingsReads: 1 });
      }),
    ),
  );
});
