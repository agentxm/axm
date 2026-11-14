import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { NativeWriteAuthority } from "../agent-adapters/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import {
  FootprintRecorder,
  makeFootprintRecorder,
  runWorkspaceTransaction,
} from "../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../settlement/testing.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { NativeWriteAuthorityLive } from "./live.js";

/**
 * The live insertion authority and a transaction scope over one recording
 * filesystem, provided beneath every layer that captures `FileSystem`.
 */
const recordedAuthority = (root: string, workspaceDir: string) =>
  Layer.mergeAll(
    NativeWriteAuthorityLive.pipe(
      Layer.provide(Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive)),
    ),
    WorkspaceTransactionScopeTest({
      workspaceDir,
      settingsPath: `${root}/axm.json`,
      lockPath: `${root}/axm.lock`,
    }),
  ).pipe(Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)));

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
  const workspaceDir = path.join(root, ".axm");
  yield* fs.makeDirectory(workspaceDir);
  return { root, workspaceDir, store: path.join(workspaceDir, "projection-containers.json") };
});

const storeWork = (
  recording: FileSystemRecording,
  store: string,
): {
  readonly reads: ReadonlyArray<"success" | "failure" | "interrupted">;
  readonly access: number;
  readonly tempWrites: number;
  readonly renames: number;
} => ({
  reads: recording.calls({ path: store, method: "readFile" }).map(({ outcome }) => outcome),
  access: recording.counts(store).access ?? 0,
  tempWrites: recording
    .calls({ method: "writeFile" })
    .filter((call) => call.path.startsWith(`${store}.tmp.`)).length,
  renames: recording.counts(store).rename ?? 0,
});

/** Drive one eligible insertion of a new native file and measure only its receipt record. */
const insertNewFile = (root: string, store: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    const recording = yield* FileSystemRecorder;
    const file = path.join(root, name);
    const afterRaw = `{"${name}":true}\n`;
    const capture = yield* authority.captureInsertion({
      path: file,
      unit: name,
      beforeRaw: Option.none(),
      eligible: true,
    });
    const createdDirectories = yield* authority.createParentDirectories(file);
    yield* fs.writeFileString(file, afterRaw);
    recording.reset();
    yield* authority.recordInsertion({ capture, afterRaw, createdDirectories });
    return storeWork(recording, store);
  });

const transaction = <A, E, R>(transition: Effect.Effect<A, E, R>) =>
  runWorkspaceTransaction({
    targets: [],
    claimDefaultTargets: false,
    transition,
    validate: () => Effect.void,
  });

const storeLabels = (footprint: Effect.Success<typeof makeFootprintRecorder>, store: string) =>
  Effect.map(Ref.get(footprint.ref), (entries) =>
    entries.filter((entry) => entry.path === store).map((entry) => entry.change),
  );

describe("native insertion receipt store writes", () => {
  it.effect("publishes each changed store from its locked read without re-reading it", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store } = yield* fixture;
      yield* Effect.gen(function* () {
        const footprint = yield* makeFootprintRecorder;
        const absentStore = yield* transaction(insertNewFile(root, store, "first.json")).pipe(
          Effect.provideService(FootprintRecorder, footprint),
        );
        const firstTouch = yield* transaction(insertNewFile(root, store, "second.json")).pipe(
          Effect.provideService(FootprintRecorder, footprint),
        );
        const sameClosure = yield* transaction(
          Effect.gen(function* () {
            yield* insertNewFile(root, store, "third.json");
            return yield* insertNewFile(root, store, "fourth.json");
          }),
        ).pipe(Effect.provideService(FootprintRecorder, footprint));
        expect({ absentStore, firstTouch, sameClosure }).toEqual({
          // Post-write verification; the first-touch snapshot alone probes the absent store.
          absentStore: { reads: ["success"], access: 1, tempWrites: 1, renames: 1 },
          // Locked read, first-touch snapshot, post-write verification.
          firstTouch: {
            reads: ["success", "success", "success"],
            access: 1,
            tempWrites: 1,
            renames: 1,
          },
          // Locked read, same-closure foreign-change check, post-write verification.
          sameClosure: {
            reads: ["success", "success", "success"],
            access: 0,
            tempWrites: 1,
            renames: 1,
          },
        });
        expect(yield* storeLabels(footprint, store)).toEqual([
          "created",
          "modified",
          "modified",
          "modified",
        ]);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("labels an existing empty store as modified", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store } = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(store, '{"version":1,"entries":[],"createdDirectories":[]}\n');
      yield* Effect.gen(function* () {
        const footprint = yield* makeFootprintRecorder;
        yield* transaction(insertNewFile(root, store, "first.json")).pipe(
          Effect.provideService(FootprintRecorder, footprint),
        );
        expect(yield* storeLabels(footprint, store)).toEqual(["modified"]);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses a store replaced with identical bytes after this closure touched it", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store } = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        const refused = yield* transaction(
          Effect.gen(function* () {
            yield* insertNewFile(root, store, "first.json");
            const bytes = yield* fs.readFileString(store);
            yield* fs.writeFileString(`${store}.foreign`, bytes);
            yield* fs.rename(`${store}.foreign`, store);
            return yield* insertNewFile(root, store, "second.json").pipe(Effect.flip);
          }),
        );
        expect(refused).toMatchObject({
          _tag: "NativeWriteRefused",
          path: store,
          cause: { _tag: "WorkspaceSnapshotError", cause: "foreign-change" },
        });
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses a hardlinked store", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store } = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        yield* transaction(insertNewFile(root, store, "first.json"));
        yield* fs.link(store, `${root}/store-link.json`);
        const refused = yield* transaction(insertNewFile(root, store, "second.json")).pipe(
          Effect.flip,
        );
        expect(refused).toMatchObject({
          _tag: "NativeWriteRefused",
          path: store,
          cause: {
            _tag: "WorkspaceSnapshotError",
            step: "inspect-target",
            cause: { _tag: "NativeLocationError", reason: "hardlink" },
          },
        });
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
