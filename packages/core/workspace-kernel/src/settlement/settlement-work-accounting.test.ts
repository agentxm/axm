/**
 * Owner-level work accounting for settlement: per-path filesystem calls and
 * preimage digests that one protection, publication, rollback, or cleanup
 * performs. Real temporary directories carry the identities and atomic renames
 * that settlement compares; the recording filesystem counts only Effect
 * `FileSystem` primitives, so native canonical-path probes are not counted here.
 */
import { describe, expect, it } from "@effect/vitest";
import { writeFileAtomic, writeFilePreservingIdentity } from "@agentxm/host-primitives";
import { CurrentWorkObserver, type WorkObserver } from "@agentxm/host-primitives/work-observation";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { resolveNativeReferent } from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest } from "../locations/testing.js";
import { CurrentWorkspaceTransaction } from "./context.js";
import { WorkspaceRestorationError } from "./errors.js";
import {
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFilePublication,
  retireWorkspacePath,
  runWorkspaceTransaction,
} from "./index.js";
import { observePathState } from "./path-state.js";
import type { WorkspaceTransactionArgs } from "./scope.js";
import { WorkspaceTransactionScopeTest } from "./testing.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);

/** Preimage digests grouped by the span that encloses each one. */
const hashCounter = () => {
  let parents: Array<string> = [];
  const observer: WorkObserver = {
    record: (fact, parent) => {
      if (fact.kind !== "axm.hash.preimage") return;
      parents.push(parent === undefined ? "" : parent._tag === "Span" ? parent.name : "external");
    },
    detailSelected: () => false,
  };
  return {
    observer,
    total: () => parents.length,
    under: (name: string) => parents.filter((parent) => parent === name).length,
    reset: () => {
      parents = [];
    },
  };
};

const workspace = Effect.gen(function* () {
  const native = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* native
    .makeTempDirectoryScoped({ prefix: "axm-settlement-work-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  const workspaceDir = path.join(root, ".axm");
  yield* native.makeDirectory(workspaceDir);
  yield* native.writeFileString(path.join(root, "axm.json"), "{}\n");
  const { fileSystem, recording } = makeRecordingFileSystem(native);
  const hashes = hashCounter();
  // Settlement captures the ambient filesystem when the scope is built, so the
  // recording filesystem is provided outside the scope layer.
  const transact = <A, E, R>(args: WorkspaceTransactionArgs<A, E, R>) =>
    runWorkspaceTransaction({ claimDefaultTargets: false, ...args }).pipe(
      Effect.provide(
        WorkspaceTransactionScopeTest({
          workspaceDir,
          settingsPath: path.join(root, "axm.json"),
          lockPath: path.join(root, "axm.lock"),
        }),
      ),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(CurrentWorkObserver, hashes.observer),
    );
  return { native, fs: fileSystem, path, root, recording, hashes, transact };
});

const publish = (fs: FileSystem.FileSystem, file: string, content: string | Uint8Array) =>
  writeFileAtomic(fs, {
    targetPath: file,
    content,
    mapError: ({ cause }) => cause,
    onPublished: (publication) =>
      recordFilePublication({ path: file, change: "modified" }, publication),
  });

const retiredStore = (recording: FileSystemRecording, path: Path.Path) =>
  recording
    .calls({ method: "makeTempDirectory" })
    .map((call) => call.path)
    .find((created) => path.basename(created).startsWith(".axm-retired-"));

describe("settlement work accounting", () => {
  for (const kind of ["string", "bytes"] as const) {
    it.effect(`verifies a ${kind} publication with one readback digest`, () =>
      Effect.gen(function* () {
        const { native, fs, path, root, recording, hashes, transact } = yield* workspace;
        const file = path.join(root, "target.txt");
        yield* native.writeFileString(file, "before\n");
        recording.reset();
        hashes.reset();
        yield* transact({
          targets: [file],
          transition: publish(fs, file, kind === "string" ? "after\n" : Buffer.from("after\n")),
          validate: () => Effect.void,
        });
        expect(yield* native.readFileString(file)).toBe("after\n");
        // The snapshot digest and the publication readback digest.
        expect(hashes.total()).toBe(2);
        expect(hashes.under("axm.publish.snapshot")).toBe(1);
        expect(hashes.under("axm.publish.file")).toBe(1);
        expect(hashes.under("axm.verify.publication")).toBe(0);
        // The snapshot read and the publication readback.
        expect(recording.contentReads(file)).toBe(2);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  for (const foreign of [false, true]) {
    it.effect(
      `reads a published file once when recording created ancestors${foreign ? " beside foreign files" : ""}`,
      () =>
        Effect.gen(function* () {
          const { native, fs, path, root, recording, hashes, transact } = yield* workspace;
          const top = path.join(root, "A");
          const parent = path.join(top, "B");
          const file = path.join(parent, "file.txt");
          const foreignFile = path.join(parent, "foreign");
          const other = path.join(top, "other");
          let counted:
            | {
                readonly file: number;
                readonly foreign: number;
                readonly other: number;
                readonly hashes: number;
              }
            | undefined;
          let expected: ReadonlyArray<readonly [string, string]> = [];
          yield* transact({
            transition: Effect.gen(function* () {
              yield* protectCreatedAncestors(fs, path, parent);
              yield* fs.makeDirectory(parent, { recursive: true });
              if (foreign) {
                yield* native.writeFileString(foreignFile, "foreign\n");
                yield* native.writeFileString(other, "other\n");
              }
              yield* writeFileAtomic(fs, {
                targetPath: file,
                content: "published\n",
                mapError: ({ cause }) => cause,
                onPublished: (publication) =>
                  Effect.gen(function* () {
                    recording.reset();
                    hashes.reset();
                    yield* recordFilePublication({ path: file, change: "created" }, publication);
                    counted = {
                      file: recording.contentReads(file),
                      foreign: recording.contentReads(foreignFile),
                      other: recording.contentReads(other),
                      hashes: hashes.total(),
                    };
                  }),
              });
              const context = yield* CurrentWorkspaceTransaction;
              if (Option.isNone(context)) return expect.fail("Expected an active transaction");
              const ledger = yield* SynchronizedRef.get(context.value.ledger);
              const snapshot = ledger.snapshots.find((entry) => entry.target === top);
              expected = [...(snapshot?.expected ?? [])];
            }),
            validate: () => Effect.void,
          });
          expect(counted).toEqual({
            file: 1,
            foreign: foreign ? 1 : 0,
            other: foreign ? 1 : 0,
            hashes: foreign ? 3 : 1,
          });
          // Only AXM's own entries become rollback authority; foreign files stay outside it.
          const rootOf = (target: string) =>
            observePathState(native, path, target).pipe(Effect.map((state) => state.get("")));
          expect(expected).toEqual([
            ["", yield* rootOf(top)],
            [path.join("B", "file.txt"), yield* rootOf(file)],
            ["B", yield* rootOf(parent)],
          ]);
        }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("reads each retired file once from the store when rollback moves it back", () =>
    Effect.gen(function* () {
      const { native, path, root, recording, transact } = yield* workspace;
      const directory = path.join(root, "D");
      const names = ["f1", "f2", "f3"];
      yield* native.makeDirectory(directory);
      for (const name of names) yield* native.writeFileString(path.join(directory, name), name);
      const identity = (yield* native.stat(directory)).ino;
      let store: string | undefined;
      const result = yield* transact({
        transition: Effect.gen(function* () {
          yield* retireWorkspacePath(directory);
          store = retiredStore(recording, path);
          return yield* Effect.fail("later-step-failed" as const);
        }),
        validate: () => Effect.void,
        onRestorationStarted: Effect.sync(() => recording.reset()),
      }).pipe(Effect.flip);
      expect(result).toBe("later-step-failed");
      if (store === undefined) return expect.fail("Expected a retirement store");
      for (const name of names) {
        // Store verification reads the retired entry; the root-only store check does not.
        expect(recording.contentReads(path.join(store, "entry", name))).toBe(1);
        // In-place reconcile and final verification; the identity check reads no content.
        expect(recording.contentReads(path.join(directory, name))).toBe(2);
        expect(yield* native.readFileString(path.join(directory, name))).toBe(name);
      }
      expect((yield* native.stat(directory)).ino).toEqual(identity);
      expect(yield* native.exists(store)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("still reads a foreign file added to a retirement store during rollback", () =>
    Effect.gen(function* () {
      const { native, path, root, recording, transact } = yield* workspace;
      const directory = path.join(root, "D");
      yield* native.makeDirectory(directory);
      yield* native.writeFileString(path.join(directory, "f1"), "f1");
      let store: string | undefined;
      const result = yield* transact({
        transition: Effect.gen(function* () {
          yield* retireWorkspacePath(directory);
          store = retiredStore(recording, path);
          if (store !== undefined)
            yield* native.writeFileString(path.join(store, "foreign"), "foreign\n");
          return yield* Effect.fail("later-step-failed" as const);
        }),
        validate: () => Effect.void,
        onRestorationStarted: Effect.sync(() => recording.reset()),
      }).pipe(Effect.flip);
      if (store === undefined) return expect.fail("Expected a retirement store");
      const foreign = path.join(store, "foreign");
      const calls = recording.calls();
      const movedBack = calls.findIndex(
        (call) =>
          call.method === "rename" &&
          call.path === path.join(store ?? "", "entry") &&
          call.toPath === directory,
      );
      expect(movedBack).toBeGreaterThan(-1);
      const foreignReads = (entries: typeof calls) =>
        entries.filter((call) => call.method === "readFile" && call.path === foreign).length;
      // Read by the store check before the original moves back, then by cleanup.
      expect(foreignReads(calls.slice(0, movedBack))).toBe(1);
      expect(foreignReads(calls)).toBe(2);
      if (typeof result === "string" || result._tag !== "WorkspaceRestorationIncomplete")
        return expect.fail("Expected retained recovery evidence");
      expect(result.retained).toEqual([path.basename(store)]);
      expect(result.recovery.map((entry) => entry.kind)).toEqual(["snapshot"]);
      expect(yield* native.readFileString(path.join(directory, "f1"))).toBe("f1");
      expect(yield* native.readDirectory(store)).toEqual(["foreign"]);
      yield* native.remove(store, { recursive: true });
      if (result.snapshotDir !== undefined)
        yield* native.remove(result.snapshotDir, { recursive: true });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const variant of ["same bytes", "different bytes"] as const) {
    it.effect(`reconciles an in-place write of ${variant} without comparing digests`, () =>
      Effect.gen(function* () {
        const { native, fs, path, root, recording, hashes, transact } = yield* workspace;
        const file = path.join(root, "file.txt");
        yield* native.writeFileString(file, "before\n");
        const original = yield* native.stat(file);
        let written: FileSystem.File.Info | undefined;
        const result = yield* transact({
          targets: [file],
          transition: Effect.gen(function* () {
            yield* writeFilePreservingIdentity(fs, {
              targetPath: file,
              // Equal lengths, so only the byte comparison can tell them apart.
              content: variant === "same bytes" ? "before\n" : "BEFORE\n",
              mapError: (cause) => cause,
              onPublished: (publication) =>
                recordFilePublication({ path: file, change: "modified" }, publication),
            });
            written = yield* native.stat(file);
            recording.reset();
            hashes.reset();
            return yield* Effect.fail("later-step-failed" as const);
          }),
          validate: () => Effect.void,
        }).pipe(Effect.flip);
        expect(result).toBe("later-step-failed");
        // Only the postimage comparison before reconcile digests the target.
        expect(hashes.under("axm.rollback.restore")).toBe(1);
        expect(hashes.under("axm.rollback.verify")).toBe(2);
        const restored = yield* native.stat(file);
        expect(restored.ino).toEqual(original.ino);
        expect(yield* native.readFileString(file)).toBe("before\n");
        if (variant === "same bytes") {
          expect(recording.writes(file)).toBe(0);
          expect(Option.getOrUndefined(restored.mtime)?.getTime()).toBe(
            written === undefined ? undefined : Option.getOrUndefined(written.mtime)?.getTime(),
          );
        } else expect(recording.writes(file)).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("walks the ancestors above the native root once per snapshot and restoration", () =>
    Effect.gen(function* () {
      const { native, fs, path, root, recording, transact } = yield* workspace;
      const file = path.join(root, "file.txt");
      yield* native.writeFileString(file, "before\n");
      let protecting: ReturnType<FileSystemRecording["counts"]> = {};
      const result = yield* transact({
        transition: Effect.gen(function* () {
          recording.reset();
          yield* protectWorkspacePath(file);
          protecting = recording.counts("/");
          yield* publish(fs, file, "after\n");
          return yield* Effect.fail("later-step-failed" as const);
        }),
        validate: () => Effect.void,
        onRestorationStarted: Effect.sync(() => recording.reset()),
      }).pipe(Effect.flip);
      expect(result).toBe("later-step-failed");
      const restoring = recording.counts("/");
      expect([protecting.stat, protecting.realPath]).toEqual([1, 1]);
      expect([restoring.stat, restoring.realPath]).toEqual([1, 1]);
      expect(yield* native.readFileString(file)).toBe("before\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses restoration through a retargeted parent and keeps recovery evidence", () =>
    Effect.gen(function* () {
      const { native, fs, path, root, transact } = yield* workspace;
      const parent = path.join(root, "P");
      const file = path.join(parent, "file.txt");
      yield* native.makeDirectory(parent);
      yield* native.writeFileString(file, "before\n");
      const result = yield* transact({
        transition: Effect.gen(function* () {
          yield* protectWorkspacePath(file);
          yield* publish(fs, file, "after\n");
          yield* native.rename(parent, path.join(root, "P.old"));
          yield* native.makeDirectory(parent);
          return yield* Effect.fail("later-step-failed" as const);
        }),
        validate: () => Effect.void,
      }).pipe(Effect.flip);
      if (typeof result === "string" || result._tag !== "WorkspaceRestorationIncomplete")
        return expect.fail("Expected retained recovery evidence");
      const cause = result.restorationCause;
      if (!(cause instanceof WorkspaceRestorationError) || !Array.isArray(cause.cause))
        return expect.fail("Expected a restoration failure list");
      const first: unknown = cause.cause[0]?.cause;
      // The route check fails inside restoration and is reported as a foreign change.
      expect(first).toBeInstanceOf(WorkspaceRestorationError);
      if (first instanceof WorkspaceRestorationError) {
        expect(first.step).toBe("foreign-change");
        expect(first.cause).toBeInstanceOf(WorkspaceRestorationError);
        if (first.cause instanceof WorkspaceRestorationError) {
          expect(first.cause.step).toBe("foreign-change");
          expect(first.cause.cause).toBe("native-parent-route-changed");
        }
      }
      expect(result.retained).toEqual([path.join("P", "file.txt")]);
      const recovery = result.recovery.find((entry) => entry.originalPath === file);
      expect(recovery?.kind).toBe("snapshot");
      if (recovery !== undefined)
        expect(yield* native.readFileString(recovery.recoveryPath)).toBe("before\n");
      expect(yield* native.readFileString(path.join(root, "P.old", "file.txt"))).toBe("after\n");
      if (result.snapshotDir !== undefined)
        yield* native.remove(result.snapshotDir, { recursive: true });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("reads each quarantined file once when settlement discards a retirement", () =>
    Effect.gen(function* () {
      const { native, path, root, recording, transact } = yield* workspace;
      const directory = path.join(root, "D");
      yield* native.makeDirectory(directory);
      yield* native.writeFileString(path.join(directory, "f1"), "f1");
      yield* native.writeFileString(path.join(directory, "f2"), "f2");
      let store: string | undefined;
      yield* transact({
        transition: Effect.gen(function* () {
          yield* retireWorkspacePath(directory);
          store = retiredStore(recording, path);
        }),
        validate: () => Effect.sync(() => recording.reset()),
      });
      if (store === undefined) return expect.fail("Expected a retirement store");
      // The fresh entry check before removal is the remaining read.
      expect(recording.contentReads(path.join(store, "entry", "f1"))).toBe(1);
      expect(recording.contentReads(path.join(store, "entry", "f2"))).toBe(1);
      expect(yield* native.exists(store)).toBe(false);
      expect(yield* native.exists(directory)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
