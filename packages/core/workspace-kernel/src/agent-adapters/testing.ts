/**
 * @agentxm/workspace-kernel/agent-adapters test doubles.
 *
 * Native writers keep `NativeWriteAuthority` in `R`; tests that exercise a
 * writer without a workspace transaction provide one of these layers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Path from "effect/Path";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import {
  NativeWriteAuthority,
  NativeWriteRefused,
  type NativeWriteRecord,
  type NativeWriteAuthorityService,
} from "./native-write-authority.js";
import { WorkspaceFileWriteLocks } from "../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";

// This permissive port deliberately models lexical paths. Physical identity
// and refusal belong to the live authority and its filesystem specifications.
const writeLocks = Layer.provide(
  WorkspaceFileWriteLocksLive,
  Layer.merge(
    Path.layer,
    Layer.succeed(
      FileSystem.FileSystem,
      FileSystem.makeNoop({ realPath: (target) => Effect.succeed(target) }),
    ),
  ),
);

const permissiveInsertions = {
  createParentDirectories: (target) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs
        .makeDirectory(path.dirname(target), { recursive: true })
        .pipe(Effect.mapError((cause) => new NativeWriteRefused({ path: target, cause })));
      return [];
    }),
  captureCreatedDirectories: (args) =>
    Effect.succeed({
      target: args,
      physicalPath: args.path,
      anchor: {
        nativeRoot: "/",
        ownerRoot: "/",
        identityOwnerRoot: "/",
        target: "/",
        physicalPath: "/",
        owner: { path: "/", identity: { device: 0, inode: "0", birthtime: 0, mode: 0 } },
        root: { path: "/", identity: { device: 0, inode: "0", birthtime: 0, mode: 0 } },
        entry: { device: 0, inode: "0", birthtime: 0, mode: 0 },
        parents: [],
        aliases: [],
      },
      missingDirectories: [],
      eligible: false,
    }),
  recordCreatedDirectories: () => Effect.void,
  retireCreatedDirectories: () => Effect.void,
  captureInsertion: (args) =>
    Effect.succeed({
      target: args,
      context: { nativeRoot: "/", target: args.path },
      beforeRaw: args.beforeRaw,
      beforeIdentity: Option.none(),
      anchor: Option.none(),
      physicalPath: args.path,
      eligible: false,
      receipts: [],
      missingDirectories: [],
    }),
  recordInsertion: () => Effect.void,
  resolveInsertion: () => Effect.succeedNone,
  resolveInsertions: () => Effect.succeedNone,
  forgetInsertion: () => Effect.void,
  retireInsertion: () => Effect.succeed(false),
} satisfies Pick<
  NativeWriteAuthorityService,
  | "createParentDirectories"
  | "captureCreatedDirectories"
  | "recordCreatedDirectories"
  | "retireCreatedDirectories"
  | "captureInsertion"
  | "recordInsertion"
  | "resolveInsertion"
  | "resolveInsertions"
  | "forgetInsertion"
  | "retireInsertion"
>;

/** Permits every protection request and drops every reported change. */
export const NativeWriteAuthorityPermissive = Layer.effect(
  NativeWriteAuthority,
  Effect.map(WorkspaceFileWriteLocks, (locks) =>
    NativeWriteAuthority.of({
      ...permissiveInsertions,
      withExclusiveWrite: (absolutePath, effect) =>
        locks
          .withLock(absolutePath, effect)
          .pipe(
            Effect.catchTag("WorkspaceSnapshotError", (cause) =>
              Effect.fail(new NativeWriteRefused({ path: absolutePath, cause })),
            ),
          ),
      protect: () => Effect.void,
      record: () => Effect.void,
    }),
  ),
).pipe(Layer.provide(writeLocks));

/** What a recording authority observed while a native writer ran. */
export interface RecordedNativeWrites {
  readonly protectedPaths: ReadonlyArray<string>;
  readonly records: ReadonlyArray<NativeWriteRecord>;
}

/**
 * A permissive authority that remembers what it was asked to protect and what
 * durable changes were reported, so a test can assert both.
 */
export const makeRecordingNativeWriteAuthority = Effect.gen(function* () {
  const observed = yield* Ref.make<RecordedNativeWrites>({ protectedPaths: [], records: [] });
  const layer = Layer.effect(
    NativeWriteAuthority,
    Effect.map(WorkspaceFileWriteLocks, (locks) =>
      NativeWriteAuthority.of({
        ...permissiveInsertions,
        withExclusiveWrite: (absolutePath, effect) =>
          locks
            .withLock(absolutePath, effect)
            .pipe(
              Effect.catchTag("WorkspaceSnapshotError", (cause) =>
                Effect.fail(new NativeWriteRefused({ path: absolutePath, cause })),
              ),
            ),
        protect: (absolutePath: string) =>
          Ref.update(observed, (current) => ({
            ...current,
            protectedPaths: [...current.protectedPaths, absolutePath],
          })),
        record: (change: NativeWriteRecord) =>
          Ref.update(observed, (current) => ({
            ...current,
            records: [...current.records, change],
          })),
      }),
    ),
  ).pipe(Layer.provide(writeLocks));
  return { layer, observed: Ref.get(observed) } as const;
});
