import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  NativeLocationError,
  captureContainerIdentity,
  readContainerReceipts,
  recordContainerReceipt,
  updateContainerReceipts,
  type ContainerReceipt,
} from "./index.js";

/** Receipt-store work counted on the real filesystem, with a store-only mutation. */
const withRecordedFileSystem = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(layerRecordingFileSystem(NodeServices.layer)),
    Effect.scoped,
    Effect.provide(NodeServices.layer),
  );

const storeFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const workspaceDir = path.join(root, ".axm");
  const store = path.join(workspaceDir, "projection-containers.json");
  const native = path.join(root, "native.json");
  yield* fs.writeFileString(native, "{}");
  const identity = yield* captureContainerIdentity({ nativeRoot: root, target: native });
  const receipt = (unit: string): ContainerReceipt => ({ unit, kind: "inserted-key", identity });
  const written: Array<{
    readonly target: string;
    readonly contents: string;
    readonly prior: Option.Option<string> | undefined;
  }> = [];
  const mutation = {
    withLock: <A, E, R>(_target: string, effect: Effect.Effect<A, E, R>) => effect,
    createDirectory: (directory: string) => fs.makeDirectory(directory).pipe(Effect.as(true)),
    write: (target: string, contents: string, prior?: { readonly text: Option.Option<string> }) =>
      Effect.sync(() => {
        written.push({ target, contents, prior: prior?.text });
      }).pipe(Effect.andThen(fs.writeFileString(target, contents))),
    retire: (target: string) => fs.remove(target),
  };
  return { fs, path, root, workspaceDir, store, receipt, written, mutation };
});

describe("container receipt store updates", () => {
  it.effect("hands the writer exactly the text it read under the lock", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, workspaceDir, store, receipt, written, mutation } = yield* storeFixture;
        const recording = yield* FileSystemRecorder;
        yield* fs.makeDirectory(workspaceDir);

        recording.reset();
        yield* recordContainerReceipt(workspaceDir, receipt("first"), mutation);
        expect(written.map(({ prior }) => prior)).toEqual([Option.none()]);
        expect(recording.calls({ path: store, method: "readFile" })).toHaveLength(0);

        const onDisk = yield* fs.readFileString(store);
        recording.reset();
        yield* recordContainerReceipt(workspaceDir, receipt("second"), mutation);
        expect(written.map(({ prior }) => prior)).toEqual([Option.none(), Option.some(onDisk)]);
        // The locked read is the only content read of the store during the update.
        expect(recording.calls({ path: store, method: "readFile" })).toHaveLength(1);
      }),
    ),
  );

  it.effect("re-proves an existing store parent once and leaves no-op paths unchanged", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, root, workspaceDir, receipt, mutation } = yield* storeFixture;
        const recording = yield* FileSystemRecorder;
        yield* fs.makeDirectory(workspaceDir);
        yield* recordContainerReceipt(workspaceDir, receipt("first"), mutation);
        const parentWork = () => {
          const counts = recording.counts(workspaceDir);
          return {
            realPath: counts.realPath ?? 0,
            stat: counts.stat ?? 0,
            readLink: counts.readLink ?? 0,
          };
        };

        recording.reset();
        yield* captureContainerIdentity({
          nativeRoot: workspaceDir,
          ownerRoot: root,
          target: workspaceDir,
        });
        const oneAnchorProof = parentWork();

        recording.reset();
        yield* recordContainerReceipt(workspaceDir, receipt("second"), mutation);
        const changedWrite = parentWork();

        recording.reset();
        yield* recordContainerReceipt(workspaceDir, receipt("second"), mutation);
        const unchangedEntries = parentWork();

        recording.reset();
        yield* updateContainerReceipts(workspaceDir, () => [], mutation);
        const retiredStore = parentWork();

        expect({ oneAnchorProof, changedWrite, unchangedEntries, retiredStore }).toEqual({
          oneAnchorProof: { realPath: 2, stat: 3, readLink: 1 },
          // One anchor capture; nothing is re-proved when no directory is created.
          changedWrite: { realPath: 2, stat: 3, readLink: 1 },
          unchangedEntries: { realPath: 0, stat: 0, readLink: 0 },
          retiredStore: { realPath: 0, stat: 0, readLink: 0 },
        });
        expect(yield* fs.exists(workspaceDir)).toBe(true);
      }),
    ),
  );

  it.effect("still refuses a store parent replaced while the store directory is created", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, path, root, receipt, mutation } = yield* storeFixture;
        const owner = path.join(root, "workspace");
        const workspaceDir = path.join(owner, ".axm");
        yield* fs.makeDirectory(owner);
        const replacing = {
          ...mutation,
          createDirectory: (directory: string) =>
            Effect.gen(function* () {
              yield* fs.rename(owner, path.join(root, "replaced-workspace"));
              yield* fs.makeDirectory(owner);
              yield* fs.makeDirectory(directory);
              return true;
            }),
        };
        const refused = yield* recordContainerReceipt(
          workspaceDir,
          receipt("first"),
          replacing,
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NativeLocationError);
        expect(refused).toMatchObject({ cause: "receipt-store-parent-changed" });
        expect((yield* readContainerReceipts(workspaceDir)).entries).toEqual([]);
      }),
    ),
  );
});
