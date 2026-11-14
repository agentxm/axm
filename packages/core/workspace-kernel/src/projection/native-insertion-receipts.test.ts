import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
  type RecordedFileSystemMethod,
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
import { captureContainerIdentity, readContainerReceipts } from "../locations/index.js";
import { NativePlatformTest, workObservations } from "../locations/testing.js";
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

/** Reset setup noise, then run one authority call and snapshot its work. */
const measured = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const observations = workObservations(false);
    const result = yield* observations.provide(effect);
    const calls = recording.calls();
    const count = (target: string, method: RecordedFileSystemMethod) =>
      calls.filter((call) => call.path === target && call.method === method).length;
    return {
      result,
      hashes: observations.facts.filter((fact) => fact.kind === "axm.hash.receipt").length,
      /** Resolutions of one path's own entry; every authorize and identity capture makes one. */
      leaf: (target: string) => count(target, "readLink"),
      contentReads: (target: string) => count(target, "readFile"),
    };
  });

/** One eligible insertion through the live authority, as an owner performs it under its lock. */
const insert = (args: {
  readonly file: string;
  readonly unit: string;
  readonly beforeRaw: Option.Option<string>;
  readonly afterRaw: string;
  readonly aliases?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const authority = yield* NativeWriteAuthority;
    const capture = yield* authority.captureInsertion({
      path: args.file,
      unit: args.unit,
      beforeRaw: args.beforeRaw,
      eligible: true,
      ...(args.aliases === undefined ? {} : { aliases: args.aliases }),
    });
    const createdDirectories = yield* authority.createParentDirectories(args.file);
    yield* fs.writeFileString(args.file, args.afterRaw);
    return { capture, createdDirectories };
  });

const shared = '{"u":1}';
const extended = '{"u":1,"w":2}';

/** A real workspace and its ordinary native leaf, which no setup has created yet. */
const sharedIdentityFixture = () =>
  Effect.gen(function* () {
    const { root, workspaceDir, store } = yield* fixture;
    const path = yield* Path.Path;
    return { root, workspaceDir, store, file: path.join(root, "native.json") };
  });

/** Create the leaf through unit `u`: an inserted-key and a created-file receipt with one identity. */
const seedShared = (file: string, aliases?: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    const inserted = yield* insert({
      file,
      unit: "u",
      beforeRaw: Option.none(),
      afterRaw: shared,
      ...(aliases === undefined ? {} : { aliases }),
    });
    yield* authority.recordInsertion({ ...inserted, afterRaw: shared });
  });

/** Leaf resolutions of one isolated identity capture of `file`. */
const isolatedCapture = (root: string, file: string) =>
  Effect.map(
    measured(captureContainerIdentity({ nativeRoot: root, ownerRoot: root, target: file })),
    (work) => work.leaf(file),
  );

describe("native insertion authority work per call", () => {
  it.effect("captures an existing file with one admission, one digest, and one proof", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store, file } = yield* sharedIdentityFixture();
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        yield* seedShared(file);
        const k = yield* isolatedCapture(root, file);
        expect(k).toBe(1);
        const capture = yield* measured(
          authority.captureInsertion({
            path: file,
            unit: "v",
            beforeRaw: Option.some(shared),
            eligible: false,
          }),
        );
        expect({
          receipts: capture.result.receipts.map(({ kind, unit }) => `${kind}:${unit}`),
          // One admission, the before-identity capture, and one live proof
          // (authorize + verify) for the identity both receipts share.
          leaf: capture.leaf(file),
          fileReads: capture.contentReads(file),
          storeReads: capture.contentReads(store),
          hashes: capture.hashes,
        }).toEqual({
          receipts: ["inserted-key:u", "created-file:u"],
          leaf: 5 * k,
          fileReads: 1,
          storeReads: 1,
          hashes: 1,
        });
        const before = yield* FileSystem.FileSystem.pipe(
          Effect.flatMap((fs) => fs.readFileString(store)),
        );
        const record = yield* measured(
          authority.recordInsertion({
            capture: capture.result,
            afterRaw: shared,
            createdDirectories: [],
          }),
        );
        expect({ leaf: record.leaf(file), hashes: record.hashes }).toEqual({
          // Readback admission, the post-write capture, and one post-write
          // recapture for the identity both priors share.
          leaf: 3 * k,
          hashes: 1,
        });
        expect(
          yield* FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.readFileString(store))),
        ).toBe(before);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("records each insertion with only the digests its inverse already derived", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const plain = path.join(root, "plain.json");
      yield* fs.writeFileString(plain, "{}");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const created = yield* insert({
          file,
          unit: "u",
          beforeRaw: Option.none(),
          afterRaw: shared,
        });
        const createdRecord = yield* measured(
          authority.recordInsertion({ ...created, afterRaw: shared }),
        );
        const extendedInsert = yield* insert({
          file,
          unit: "w",
          beforeRaw: Option.some(shared),
          afterRaw: extended,
        });
        expect(extendedInsert.capture.receipts).toHaveLength(2);
        const extendedRecord = yield* measured(
          authority.recordInsertion({ ...extendedInsert, afterRaw: extended }),
        );
        const unmanaged = yield* measured(
          authority.captureInsertion({
            path: plain,
            unit: "x",
            beforeRaw: Option.some("{}"),
            eligible: false,
          }),
        );
        const unmanagedRecord = yield* measured(
          authority.recordInsertion({
            capture: unmanaged.result,
            afterRaw: "{}",
            createdDirectories: [],
          }),
        );
        expect({
          created: createdRecord.hashes,
          extended: extendedRecord.hashes,
          unmanagedCapture: unmanaged.hashes,
          unmanagedRecord: unmanagedRecord.hashes,
        }).toEqual({ created: 2, extended: 2, unmanagedCapture: 0, unmanagedRecord: 0 });
        const receipts = (yield* readContainerReceipts(workspaceDir)).entries;
        const afterSha = receipts.find(
          (receipt) => receipt.kind === "inserted-key" && receipt.unit === "w",
        )?.inverse?.afterSha256;
        expect(
          receipts.map(({ kind, unit, contentSha256 }) => [kind, unit, contentSha256 === afterSha]),
        ).toEqual([
          ["inserted-key", "u", true],
          ["created-file", "u", true],
          ["inserted-key", "w", true],
        ]);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("proves each distinct receipt identity once while distinct aliases stay separate", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(file, "{}");
      yield* fs.symlink("native.json", alias);
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const first = yield* insert({
          file,
          unit: "u",
          beforeRaw: Option.some("{}"),
          afterRaw: shared,
          aliases: [alias],
        });
        yield* authority.recordInsertion({ ...first, afterRaw: shared });
        const second = yield* insert({
          file,
          unit: "w",
          beforeRaw: Option.some(shared),
          afterRaw: extended,
        });
        yield* authority.recordInsertion({ ...second, afterRaw: extended });
        const k = yield* isolatedCapture(root, file);
        const capture = yield* measured(
          authority.captureInsertion({
            path: file,
            unit: "v",
            beforeRaw: Option.some(extended),
            eligible: false,
          }),
        );
        const record = yield* measured(
          authority.recordInsertion({
            capture: capture.result,
            afterRaw: extended,
            createdDirectories: [],
          }),
        );
        expect({
          receipts: capture.result.receipts.map(({ kind, unit }) => `${kind}:${unit}`),
          // Admission, before-identity capture, and one live proof per identity.
          captureLeaf: capture.leaf(file),
          // One alias-bearing identity capture resolves the alias twice.
          captureAlias: capture.leaf(alias),
          // Readback admission, post-write capture, and one recapture per prior identity.
          recordLeaf: record.leaf(file),
          recordAlias: record.leaf(alias),
        }).toEqual({
          receipts: ["inserted-key:u", "inserted-key:w"],
          captureLeaf: 7 * k,
          captureAlias: 2,
          recordLeaf: 4 * k,
          recordAlias: 2,
        });
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("resolves stacked inverses from one digest of each text", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const first = '{"first":1}';
        const both = '{"first":1,"second":2}';
        const initial = yield* insert({
          file,
          unit: "first",
          beforeRaw: Option.none(),
          afterRaw: first,
        });
        yield* authority.recordInsertion({ ...initial, afterRaw: first });
        const second = yield* insert({
          file,
          unit: "second",
          beforeRaw: Option.some(first),
          afterRaw: both,
        });
        yield* authority.recordInsertion({ ...second, afterRaw: both });
        const resolved = yield* measured(
          authority.resolveInsertions({ path: file, units: ["first", "second"], raw: both }),
        );
        // The current text once, then each restored text once.
        expect({ result: resolved.result, hashes: resolved.hashes }).toEqual({
          result: Option.some({ kind: "remove-file" }),
          hashes: 3,
        });
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

describe("native insertion authority freshness", () => {
  it.effect("expires a receipt whose file was replaced with identical bytes", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        yield* seedShared(file);
        const capture = () =>
          authority.captureInsertion({
            path: file,
            unit: "v",
            beforeRaw: Option.some(shared),
            eligible: false,
          });
        // An earlier call proves the shared identity live before the replacement.
        expect((yield* capture()).receipts).toHaveLength(2);
        yield* fs.writeFileString(`${file}.foreign`, shared);
        yield* fs.rename(`${file}.foreign`, file);
        expect((yield* capture()).receipts).toEqual([]);
        expect(
          yield* authority.resolveInsertions({ path: file, units: ["u"], raw: shared }),
        ).toEqual(Option.none());
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("keeps a stale receipt invalid beside a fresh one on the same path", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        yield* seedShared(file);
        // Keep the old entry alive so the recreated file has another inode.
        yield* fs.rename(file, `${file}.old`);
        const fresh = yield* insert({
          file,
          unit: "w",
          beforeRaw: Option.none(),
          afterRaw: shared,
        });
        yield* authority.recordInsertion({ ...fresh, afterRaw: shared });
        expect(
          (yield* readContainerReceipts(workspaceDir)).entries.map(
            ({ kind, unit }) => `${kind}:${unit}`,
          ),
        ).toEqual(["inserted-key:u", "created-file:u", "inserted-key:w", "created-file:w"]);
        const capture = yield* authority.captureInsertion({
          path: file,
          unit: "v",
          beforeRaw: Option.some(shared),
          eligible: false,
        });
        expect(capture.receipts.map(({ kind, unit }) => `${kind}:${unit}`)).toEqual([
          "inserted-key:w",
          "created-file:w",
        ]);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("refuses a record after a shared prior alias is retargeted after the write", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, store, file } = yield* sharedIdentityFixture();
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const alias = path.join(root, "alias.json");
      yield* fs.symlink("native.json", alias);
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        yield* seedShared(file, [alias]);
        const captureShared = () =>
          authority.captureInsertion({
            path: file,
            unit: "v",
            beforeRaw: Option.some(shared),
            eligible: false,
          });
        // An earlier record recaptures the shared prior identity after its write.
        const earlier = yield* captureShared();
        expect(earlier.receipts).toHaveLength(2);
        yield* authority.recordInsertion({
          capture: earlier,
          afterRaw: shared,
          createdDirectories: [],
        });
        const capture = yield* captureShared();
        expect(capture.receipts).toHaveLength(2);
        const before = yield* fs.readFileString(store);
        // The alias still addresses the container, through another link.
        yield* fs.remove(alias);
        yield* fs.symlink(file, alias);
        const refused = yield* authority
          .recordInsertion({ capture, afterRaw: shared, createdDirectories: [] })
          .pipe(Effect.flip);
        expect(refused).toMatchObject({
          _tag: "NativeWriteRefused",
          path: file,
          cause: "native-alias-changed-during-write",
        });
        expect(yield* fs.readFileString(store)).toBe(before);
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("distinguishes an absent file from an empty one and refuses a dangling leaf", () =>
    Effect.gen(function* () {
      const { root, workspaceDir, file } = yield* sharedIdentityFixture();
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const empty = path.join(root, "empty.json");
      const dangling = path.join(root, "dangling.json");
      yield* fs.writeFileString(empty, "");
      yield* fs.symlink("missing.json", dangling);
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const capture = (target: string, beforeRaw: Option.Option<string>) =>
          authority.captureInsertion({ path: target, unit: "v", beforeRaw, eligible: true });
        expect((yield* capture(file, Option.none())).beforeRaw).toEqual(Option.none());
        expect((yield* capture(empty, Option.some(""))).beforeRaw).toEqual(Option.some(""));
        const mismatched = [
          yield* capture(file, Option.some("")).pipe(Effect.flip),
          yield* capture(empty, Option.none()).pipe(Effect.flip),
        ];
        expect(mismatched.map(({ path, cause }) => ({ path, cause }))).toEqual([
          { path: file, cause: "native-content-changed-before-capture" },
          { path: empty, cause: "native-content-changed-before-capture" },
        ]);
        expect(yield* capture(dangling, Option.none()).pipe(Effect.flip)).toMatchObject({
          _tag: "NativeWriteRefused",
          path: dangling,
          cause: { _tag: "NativeLocationError", reason: "dangling-leaf" },
        });
      }).pipe(Effect.provide(recordedAuthority(root, workspaceDir)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
