import { linkSync, symlinkSync, unlinkSync } from "node:fs";

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

import {
  captureContainerIdentity,
  deriveStructuralInverse,
  readContainerReceipts,
} from "../../locations/index.js";
import { NativePlatformTest, workObservations } from "../../locations/testing.js";
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

const owned = (name: string) => `["doc",${JSON.stringify(name)}]`;

/**
 * Drive one document publication through prepare, revalidate, write, and
 * finish, counting the receipt digests computed while finishing only.
 */
const roundTrip = (
  args: { readonly root: string; readonly runtimeDir: string },
  publication: {
    readonly before: string | undefined;
    readonly after: string;
    readonly insertions: ReadonlyArray<string>;
    readonly withdrawals?: ReadonlyArray<string>;
    readonly restoredCandidates?: Array<string>;
  },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const locks = yield* WorkspaceFileWriteLocks;
    const target = path.join(args.root, "doc.json");
    const prepared = yield* prepareDocumentRoundTrip({
      context: { nativeRoot: args.root, runtimeDir: args.runtimeDir, eligible: true, locks },
      target,
      before: publication.before,
      after: publication.after,
      unitPrefix: `["doc",`,
      insertions: publication.insertions,
      withdrawals: publication.withdrawals ?? [],
      acceptRestored: (raw) =>
        Effect.sync(() => {
          publication.restoredCandidates?.push(raw);
          return true;
        }),
      mapFailure: (failedTarget, cause) => ({ target: failedTarget, cause }),
    });
    yield* prepared.revalidate;
    yield* fs.writeFileString(target, prepared.content);
    const observations = workObservations(false);
    yield* prepared.finish.pipe(observations.provide);
    return {
      content: prepared.content,
      finishHashes: observations.facts.filter((fact) => fact.kind === "axm.hash.receipt").length,
    };
  });

const documentReceipts = (runtimeDir: string, physicalPath: string) =>
  Effect.map(readContainerReceipts(runtimeDir), (store) =>
    store.entries.filter((receipt) => receipt.identity.physicalPath === physicalPath),
  );

describe("document round-trip structural inverse", () => {
  const created = '{"a":1}\n';
  const twoInserted = '{"a":1,"b":2,"c":3}\n';

  it.effect("derives no inverse for a publication that cannot record a receipt", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const target = `${paths.root}/doc.json`;
      yield* Effect.gen(function* () {
        yield* transaction(
          roundTrip(paths, { before: undefined, after: created, insertions: [owned("a")] }),
        );
        const prior = yield* documentReceipts(paths.runtimeDir, target);
        // Two insertions in one write are structurally invertible but ineligible.
        const ineligible = yield* transaction(
          roundTrip(paths, {
            before: created,
            after: twoInserted,
            insertions: [owned("b"), owned("c")],
          }),
        );
        expect({
          priorUnits: prior.map((receipt) => receipt.unit),
          finishHashes: ineligible.finishHashes,
          remaining: yield* documentReceipts(paths.runtimeDir, target),
          written: yield* FileSystem.FileSystem.pipe(
            Effect.flatMap((fs) => fs.readFileString(target)),
          ),
        }).toEqual({
          priorUnits: [owned("a")],
          finishHashes: 0,
          // The ineligible publication still expires the earlier exact baseline.
          remaining: [],
          written: twoInserted,
        });
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("records an eligible insertion's receipt and restores it on withdrawal", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const target = `${paths.root}/doc.json`;
      const inserted = '{"a":1,"b":2}\n';
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(target, created);
        const eligible = yield* transaction(
          roundTrip(paths, { before: created, after: inserted, insertions: [owned("b")] }),
        );
        const identity = yield* captureContainerIdentity({
          nativeRoot: paths.root,
          ownerRoot: paths.root,
          target,
        });
        const inverse = yield* deriveStructuralInverse(created, inserted);
        expect({
          finishHashes: eligible.finishHashes,
          receipts: yield* documentReceipts(paths.runtimeDir, target),
        }).toEqual({
          finishHashes: 2,
          receipts: [
            {
              unit: owned("b"),
              kind: "inserted-key",
              identity,
              inverse: Option.getOrThrow(inverse),
            },
          ],
        });

        const restoredCandidates: Array<string> = [];
        const withdrawn = yield* transaction(
          roundTrip(paths, {
            before: inserted,
            after: '{"a":1}',
            insertions: [],
            withdrawals: [owned("b")],
            restoredCandidates,
          }),
        );
        expect({
          content: withdrawn.content,
          restoredCandidates,
          written: yield* fs.readFileString(target),
          remaining: yield* documentReceipts(paths.runtimeDir, target),
        }).toEqual({
          content: created,
          restoredCandidates: [created],
          written: created,
          remaining: [],
        });
      }).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

describe("document round-trip preparation of an existing document", () => {
  /** Prepare one publication, counting only the preparation's work on each named path. */
  const prepareCounted = (
    args: { readonly nativeRoot: string; readonly runtimeDir: string; readonly target: string },
    before: string | undefined,
    counted: ReadonlyArray<string>,
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      const locks = yield* WorkspaceFileWriteLocks;
      recording.reset();
      const prepared = yield* prepareDocumentRoundTrip({
        context: {
          nativeRoot: args.nativeRoot,
          runtimeDir: args.runtimeDir,
          eligible: true,
          locks,
        },
        target: args.target,
        before,
        after: '{"a":1,"b":2}\n',
        unitPrefix: `["doc",`,
        insertions: [owned("b")],
        withdrawals: [],
        acceptRestored: () => Effect.succeed(true),
        mapFailure: (failedTarget, cause) => ({ target: failedTarget, cause }),
      });
      const work = counted.map((target) => {
        const counts = recording.counts(target);
        return {
          target,
          realPath: counts.realPath ?? 0,
          readLink: counts.readLink ?? 0,
          stat: counts.stat ?? 0,
          access: counts.access ?? 0,
        };
      });
      recording.reset();
      yield* prepared.revalidate;
      const revalidated = recording.counts(args.target);
      return {
        work,
        revalidate: { realPath: revalidated.realPath ?? 0, readLink: revalidated.readLink ?? 0 },
      };
    });

  it.effect("admits a project document once and captures its identity from that admission", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const target = `${paths.root}/doc.json`;
      yield* fs.writeFileString(target, '{"a":1}\n');
      const { work, revalidate } = yield* transaction(
        prepareCounted(
          { nativeRoot: paths.root, runtimeDir: paths.runtimeDir, target },
          '{"a":1}\n',
          [target, paths.root],
        ),
      ).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
      expect(work).toEqual([
        { target, realPath: 1, readLink: 1, stat: 1, access: 0 },
        { target: paths.root, realPath: 1, readLink: 0, stat: 1, access: 0 },
      ]);
      // Revalidation still captures the document afresh.
      expect(revalidate).toEqual({ realPath: 1, readLink: 1 });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("admits a user-scope document once beneath its separate native root", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const owner = `${paths.root}/.axm/workspace`;
      const runtimeDir = `${owner}/.axm`;
      const target = `${owner}/axm.json`;
      yield* fs.makeDirectory(runtimeDir, { recursive: true });
      yield* fs.writeFileString(target, '{"a":1}\n');
      const { work } = yield* transaction(
        prepareCounted({ nativeRoot: paths.root, runtimeDir, target }, '{"a":1}\n', [
          target,
          `${paths.root}/.axm/axm.json`,
          `${paths.root}/.axm/.axm`,
        ]),
      ).pipe(Effect.provide(recordedSettlement(paths.root, runtimeDir)));
      expect(work).toEqual([
        { target, realPath: 1, readLink: 1, stat: 1, access: 0 },
        { target: `${paths.root}/.axm/axm.json`, realPath: 0, readLink: 0, stat: 0, access: 1 },
        { target: `${paths.root}/.axm/.axm`, realPath: 0, readLink: 0, stat: 0, access: 1 },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("keeps an absent document's preparation work", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const target = `${paths.root}/doc.json`;
      const { work } = yield* transaction(
        prepareCounted(
          { nativeRoot: paths.root, runtimeDir: paths.runtimeDir, target },
          undefined,
          [target, paths.root],
        ),
      ).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)));
      expect(work).toEqual([
        { target, realPath: 0, readLink: 2, stat: 1, access: 0 },
        { target: paths.root, realPath: 4, readLink: 1, stat: 2, access: 0 },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still refuses a hardlinked or dangling document before capturing it", () =>
    Effect.gen(function* () {
      const paths = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const linked = `${paths.root}/linked.json`;
      const dangling = `${paths.root}/dangling.json`;
      yield* fs.writeFileString(linked, '{"a":1}\n');
      linkSync(linked, `${paths.root}/linked-copy.json`);
      symlinkSync("missing.json", dangling);
      const refusal = (target: string) =>
        transaction(
          prepareCounted(
            { nativeRoot: paths.root, runtimeDir: paths.runtimeDir, target },
            '{"a":1}\n',
            [],
          ),
        ).pipe(Effect.provide(recordedSettlement(paths.root, paths.runtimeDir)), Effect.flip);
      expect(yield* refusal(linked)).toMatchObject({
        target: linked,
        cause: { _tag: "NativeLocationError", reason: "hardlink" },
      });
      expect(yield* refusal(dangling)).toMatchObject({
        target: dangling,
        cause: { _tag: "NativeLocationError", reason: "dangling-leaf" },
      });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
