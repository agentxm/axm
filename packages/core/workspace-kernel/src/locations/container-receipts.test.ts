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
  updateContainerReceiptsSequence,
  type ContainerIdentity,
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

type ReceiptChange = (entries: ReadonlyArray<ContainerReceipt>) => ReadonlyArray<ContainerReceipt>;

/** A stub mutation that logs every lock, write, and retirement in call order. */
const loggingMutation = (
  fs: FileSystem.FileSystem,
  inherited: ReadonlyArray<ContainerIdentity> = [],
) => {
  const events: Array<
    | { readonly kind: "lock"; readonly target: string }
    | {
        readonly kind: "write";
        readonly target: string;
        readonly contents: string;
        readonly prior: Option.Option<string>;
      }
    | { readonly kind: "retire"; readonly target: string }
  > = [];
  const mutation = {
    inheritedDirectories: Effect.succeed(inherited),
    withLock: <A, E, R>(target: string, effect: Effect.Effect<A, E, R>) =>
      Effect.sync(() => {
        events.push({ kind: "lock", target });
      }).pipe(Effect.andThen(effect)),
    createDirectory: (directory: string) => fs.makeDirectory(directory).pipe(Effect.as(true)),
    write: (target: string, contents: string, prior: { readonly text: Option.Option<string> }) =>
      Effect.sync(() => {
        events.push({ kind: "write", target, contents, prior: prior.text });
      }).pipe(Effect.andThen(fs.writeFileString(target, contents))),
    retire: (target: string) =>
      Effect.sync(() => {
        events.push({ kind: "retire", target });
      }).pipe(Effect.andThen(fs.remove(target, { recursive: true }))),
  };
  return { events, mutation };
};

const withoutUnit =
  (unit: string): ReceiptChange =>
  (entries) =>
    entries.filter((entry) => entry.unit !== unit);

describe("container receipt store update sequences", () => {
  const sequenceFixture = Effect.gen(function* () {
    const fixture = yield* storeFixture;
    const { fs, path, root, workspaceDir, receipt, mutation } = fixture;
    yield* fs.makeDirectory(workspaceDir);
    const created = path.join(root, "created");
    yield* fs.makeDirectory(created);
    const createdIdentity = yield* captureContainerIdentity({
      nativeRoot: root,
      ownerRoot: root,
      target: created,
    });
    const seed = (units: ReadonlyArray<string>) =>
      updateContainerReceipts(workspaceDir, () => units.map((unit) => receipt(unit)), mutation);
    return { ...fixture, created, createdIdentity, seed };
  });

  it.effect("applies K changes under one lock and one locked read when the store stays", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, workspaceDir, store, seed } = yield* sequenceFixture;
        const recording = yield* FileSystemRecorder;
        const changes = ["a", "b", "c"].map(withoutUnit);

        yield* seed(["a", "b", "c", "d"]);
        const separate = loggingMutation(fs);
        recording.reset();
        for (const change of changes)
          yield* updateContainerReceipts(workspaceDir, change, separate.mutation);
        const separateReads = recording.calls({ path: store, method: "readFile" }).length;
        const separateResult = yield* fs.readFileString(store);

        yield* seed(["a", "b", "c", "d"]);
        const seeded = yield* fs.readFileString(store);
        const composed = loggingMutation(fs);
        recording.reset();
        yield* updateContainerReceiptsSequence(workspaceDir, changes, composed.mutation);
        const composedReads = recording.calls({ path: store, method: "readFile" }).length;

        expect({
          separateLocks: separate.events.filter(({ kind }) => kind === "lock").length,
          separateReads,
          separateWrites: separate.events.filter(({ kind }) => kind === "write").length,
          composedLocks: composed.events.filter(({ kind }) => kind === "lock").length,
          composedReads,
        }).toEqual({
          separateLocks: 3,
          separateReads: 3,
          separateWrites: 3,
          composedLocks: 1,
          composedReads: 1,
        });
        // One write of the e0 -> eK result, from the single locked read.
        expect(composed.events).toEqual([
          { kind: "lock", target: store },
          { kind: "write", target: store, contents: separateResult, prior: Option.some(seeded) },
        ]);
        expect(yield* fs.readFileString(store)).toBe(separateResult);
      }),
    ),
  );

  it.effect("publishes the last non-empty state before retiring a store that ends empty", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, workspaceDir, store, created, createdIdentity, seed } = yield* sequenceFixture;
        const recording = yield* FileSystemRecorder;
        const changes = ["a", "b", "c"].map(withoutUnit);
        yield* seed(["a", "b", "c"]);
        const seeded = yield* fs.readFileString(store);
        const composed = loggingMutation(fs, [createdIdentity]);
        recording.reset();
        yield* updateContainerReceiptsSequence(workspaceDir, changes, composed.mutation);
        const reads = recording.calls({ path: store, method: "readFile" }).length;
        const intermediate = composed.events[1];
        expect({
          locks: composed.events.filter(({ kind }) => kind === "lock").length,
          // The locked read and the re-read of the published intermediate state.
          reads,
          kinds: composed.events.map(({ kind }) => kind),
        }).toEqual({ locks: 1, reads: 2, kinds: ["lock", "write", "retire", "retire"] });
        expect(intermediate).toMatchObject({
          kind: "write",
          target: store,
          prior: Option.some(seeded),
        });
        expect(
          intermediate?.kind === "write" ? JSON.parse(intermediate.contents) : undefined,
        ).toMatchObject({
          entries: [{ unit: "c" }],
          createdDirectories: [{ physicalPath: createdIdentity.physicalPath }],
        });
        // The re-read store names the inherited directory, which retires after the store.
        expect(composed.events.slice(2)).toEqual([
          { kind: "retire", target: store },
          { kind: "retire", target: created },
        ]);
        expect(yield* fs.exists(store)).toBe(false);
      }),
    ),
  );

  it.effect("writes every state one update per change would label differently", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, workspaceDir, store, receipt, seed } = yield* sequenceFixture;
        const withUnit =
          (unit: string): ReceiptChange =>
          (entries) => [...entries, receipt(unit)];
        const writes = (events: ReturnType<typeof loggingMutation>["events"]) =>
          events.flatMap((event) =>
            event.kind === "write" ? [{ contents: event.contents, prior: event.prior }] : [],
          );
        const cases: ReadonlyArray<{
          readonly units: ReadonlyArray<string>;
          readonly changes: ReadonlyArray<ReceiptChange>;
        }> = [
          // An absent store is created by the first write and modified by the next.
          { units: [], changes: [withUnit("a"), withUnit("b"), withoutUnit("a")] },
          // A later step that restores the locked state still follows a write.
          { units: ["a"], changes: [withUnit("b"), withoutUnit("b")] },
        ];
        const observe = (
          run: (
            changes: ReadonlyArray<ReceiptChange>,
            mutation: ReturnType<typeof loggingMutation>["mutation"],
          ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>,
        ) =>
          Effect.forEach(cases, ({ units, changes }) =>
            Effect.gen(function* () {
              yield* fs.remove(store, { force: true });
              if (units.length > 0) yield* seed(units);
              const logged = loggingMutation(fs);
              yield* run(changes, logged.mutation);
              return {
                locks: logged.events.filter(({ kind }) => kind === "lock").length,
                writes: writes(logged.events),
                result: yield* fs.readFileString(store),
              };
            }),
          );
        const separate = yield* observe((changes, mutation) =>
          Effect.forEach(changes, (change) =>
            updateContainerReceipts(workspaceDir, change, mutation),
          ),
        );
        const composed = yield* observe((changes, mutation) =>
          updateContainerReceiptsSequence(workspaceDir, changes, mutation),
        );
        expect(separate.map(({ locks, writes }) => ({ locks, writes: writes.length }))).toEqual([
          { locks: 3, writes: 3 },
          { locks: 2, writes: 2 },
        ]);
        expect(composed.map(({ locks, writes }) => ({ locks, writes: writes.length }))).toEqual([
          { locks: 1, writes: 2 },
          { locks: 1, writes: 2 },
        ]);
        // The first write is the same write (from no prior text when the store
        // is absent), and the last write publishes the same final store.
        for (const [index, observed] of composed.entries()) {
          const expected = separate[index];
          expect(observed.result).toBe(expected?.result);
          expect(observed.writes[0]).toEqual(expected?.writes[0]);
          expect(observed.writes.at(-1)?.contents).toBe(expected?.writes.at(-1)?.contents);
        }
        expect(composed[0]?.writes[0]?.prior).toEqual(Option.none());
      }),
    ),
  );

  it.effect("makes the same calls as one update for a single change", () =>
    withRecordedFileSystem(
      Effect.gen(function* () {
        const { fs, workspaceDir, store, seed } = yield* sequenceFixture;
        const cases: ReadonlyArray<{
          readonly units: ReadonlyArray<string>;
          readonly change: ReceiptChange;
        }> = [
          { units: ["a", "b"], change: withoutUnit("a") },
          { units: ["a"], change: withoutUnit("a") },
          { units: ["a"], change: withoutUnit("z") },
        ];
        const observe = (
          run: (
            change: ReceiptChange,
            mutation: ReturnType<typeof loggingMutation>["mutation"],
          ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>,
        ) =>
          Effect.forEach(cases, ({ units, change }) =>
            Effect.gen(function* () {
              yield* fs.remove(store, { force: true });
              yield* seed(units);
              const logged = loggingMutation(fs);
              yield* run(change, logged.mutation);
              return logged.events;
            }),
          );
        const single = yield* observe((change, mutation) =>
          updateContainerReceipts(workspaceDir, change, mutation),
        );
        const sequence = yield* observe((change, mutation) =>
          updateContainerReceiptsSequence(workspaceDir, [change], mutation),
        );
        expect(single.map((events) => events.map(({ kind }) => kind))).toEqual([
          ["lock", "write"],
          ["lock", "retire"],
          ["lock"],
        ]);
        expect(sequence).toEqual(single);
      }),
    ),
  );
});
