import { unlinkSync } from "node:fs";

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
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { readContainerReceipts } from "../../locations/index.js";
import { NativePlatformTest } from "../../locations/testing.js";
import {
  FootprintRecorder,
  WorkspaceFileWriteLocks,
  makeFootprintRecorder,
  runWorkspaceTransaction,
} from "../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../../settlement/testing.js";
import { prepareDocumentRoundTrip } from "./document-round-trip.js";

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
  const runtimeDir = path.join(root, ".axm");
  yield* fs.makeDirectory(runtimeDir);
  return { root, runtimeDir, store: path.join(runtimeDir, "projection-containers.json") };
});

/** Locks and a transaction scope over one recording filesystem. */
const recordedSettlement = (root: string, runtimeDir: string) =>
  Layer.merge(
    WorkspaceFileWriteLocksLive,
    WorkspaceTransactionScopeTest({
      workspaceDir: runtimeDir,
      settingsPath: `${root}/axm.json`,
      lockPath: `${root}/axm.lock`,
    }),
  ).pipe(Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)));

const storeWork = (recording: FileSystemRecording, store: string) => ({
  reads: recording.calls({ path: store, method: "readFile" }).map(({ outcome }) => outcome),
  access: recording.counts(store).access ?? 0,
  tempWrites: recording
    .calls({ method: "writeFile" })
    .filter((call) => call.path.startsWith(`${store}.tmp.`)).length,
  renames: recording.counts(store).rename ?? 0,
});

/**
 * Publish one created document through the round trip and measure only its
 * receipt-store update. `republish` repeats the publication over the
 * unchanged file, whose receipt decodes identically to the stored one.
 */
const publishCreated = (
  args: { readonly root: string; readonly runtimeDir: string; readonly store: string },
  name: string,
  options?: { readonly republish?: boolean; readonly beforeFinish?: Effect.Effect<void> },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const recording = yield* FileSystemRecorder;
    const locks = yield* WorkspaceFileWriteLocks;
    const target = path.join(args.root, name);
    const prepared = yield* prepareDocumentRoundTrip({
      context: { nativeRoot: args.root, runtimeDir: args.runtimeDir, eligible: true, locks },
      target,
      before: undefined,
      after: `{"${name}":true}\n`,
      unitPrefix: `["${name}",`,
      insertions: [`["${name}","owned"]`],
      withdrawals: [],
      acceptRestored: () => Effect.succeed(true),
      mapFailure: (failedTarget, cause) => ({ target: failedTarget, cause }),
    });
    if (options?.republish !== true) {
      yield* prepared.revalidate;
      yield* fs.writeFileString(target, prepared.content);
    }
    if (options?.beforeFinish !== undefined) yield* options.beforeFinish;
    recording.reset();
    yield* prepared.finish;
    return storeWork(recording, args.store);
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

describe("document round-trip receipt store writes", () => {
  it.effect("publishes changed stores from the locked read and keeps the no-op re-read", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      yield* Effect.gen(function* () {
        const footprint = yield* makeFootprintRecorder;
        const absentStore = yield* transaction(publishCreated(paths, "first.json")).pipe(
          Effect.provideService(FootprintRecorder, footprint),
        );
        const firstTouch = yield* transaction(publishCreated(paths, "second.json")).pipe(
          Effect.provideService(FootprintRecorder, footprint),
        );
        const stored = yield* readContainerReceipts(paths.runtimeDir);
        const keyOrderNoOp = yield* transaction(
          publishCreated(paths, "second.json", { republish: true }),
        ).pipe(Effect.provideService(FootprintRecorder, footprint));
        expect({ absentStore, firstTouch, keyOrderNoOp }).toEqual({
          // Post-write verification; the first-touch snapshot alone probes the absent store.
          absentStore: { reads: ["success"], access: 1, tempWrites: 1, renames: 1 },
          // Locked read, first-touch snapshot, post-write verification.
          firstTouch: {
            reads: ["success", "success", "success"],
            access: 1,
            tempWrites: 1,
            renames: 1,
          },
          // Locked read, first-touch snapshot, and the writer's skip read: nothing published.
          keyOrderNoOp: {
            reads: ["success", "success", "success"],
            access: 2,
            tempWrites: 0,
            renames: 0,
          },
        });
        expect(yield* readContainerReceipts(paths.runtimeDir)).toEqual(stored);
        expect(yield* storeLabels(footprint, paths.store)).toEqual(["created", "modified"]);
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses a key-order no-op over a store replaced after this closure touched it", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        const refused = yield* transaction(
          Effect.gen(function* () {
            yield* publishCreated(paths, "first.json");
            const bytes = yield* fs.readFileString(paths.store);
            yield* fs.writeFileString(`${paths.store}.foreign`, bytes);
            yield* fs.rename(`${paths.store}.foreign`, paths.store);
            return yield* publishCreated(paths, "first.json", { republish: true }).pipe(
              Effect.flip,
            );
          }),
        );
        expect(refused).toMatchObject({
          target: `${paths.root}/first.json`,
          cause: {
            target: paths.store,
            cause: { _tag: "WorkspaceSnapshotError", cause: "foreign-change" },
          },
        });
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses a key-order no-op over a hardlinked store", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        yield* transaction(publishCreated(paths, "first.json"));
        yield* fs.link(paths.store, `${paths.root}/store-link.json`);
        const refused = yield* transaction(
          publishCreated(paths, "first.json", { republish: true }),
        ).pipe(Effect.flip);
        expect(refused).toMatchObject({
          target: `${paths.root}/first.json`,
          cause: {
            target: paths.store,
            cause: {
              _tag: "WorkspaceSnapshotError",
              step: "inspect-target",
              cause: { _tag: "NativeLocationError", reason: "hardlink" },
            },
          },
        });
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("rewrites a store deleted between its locked read and a key-order no-op", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        const footprint = yield* makeFootprintRecorder;
        yield* transaction(publishCreated(paths, "first.json"));
        const bytes = yield* fs.readFileString(paths.store);
        const real = yield* FileSystem.FileSystem;
        // Delete the store as soon as the update's locked read has returned it.
        let armed = false;
        const deleting = FileSystem.make({
          ...real,
          readFile: (file) =>
            real.readFile(file).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (!armed || file !== paths.store) return;
                  armed = false;
                  unlinkSync(file);
                }),
              ),
            ),
        });
        yield* transaction(
          publishCreated(paths, "first.json", {
            republish: true,
            beforeFinish: Effect.sync(() => {
              armed = true;
            }),
          }).pipe(Effect.provideService(FileSystem.FileSystem, deleting)),
        ).pipe(Effect.provideService(FootprintRecorder, footprint));
        expect(yield* fs.readFileString(paths.store)).toBe(bytes);
        expect(yield* storeLabels(footprint, paths.store)).toEqual(["created"]);
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
