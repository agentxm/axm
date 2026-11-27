import { withWork } from "@agentxm/host-primitives/work-observation";
import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  admitNativeMutationWithin,
  assertResolvedNativeMutationWithin,
  observeNativeReferent,
  resolveNativeEntryWithin,
  resolveObservedNativeEntryWithin,
  NativeLocationError,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeEntryAddress,
  type NativeReferentObservation,
} from "./native-address.js";

const EntryIdentity = Schema.Struct({
  device: Schema.String,
  inode: Schema.String,
  birthtime: Schema.Number,
  mode: Schema.Number,
});

const LocatedIdentity = Schema.Struct({ path: Schema.String, identity: EntryIdentity });
const AliasIdentity = Schema.Struct({
  path: Schema.String,
  entryPath: Schema.String,
  referentPath: Schema.String,
  linkTarget: Schema.optionalKey(Schema.String),
});

const ContainerIdentitySchema = Schema.Struct({
  nativeRoot: Schema.String,
  ownerRoot: Schema.String,
  identityOwnerRoot: Schema.String,
  target: Schema.String,
  physicalPath: Schema.String,
  owner: LocatedIdentity,
  root: LocatedIdentity,
  parents: Schema.Array(LocatedIdentity),
  entry: EntryIdentity,
  aliases: Schema.Array(AliasIdentity),
});
export type ContainerIdentity = typeof ContainerIdentitySchema.Type;

const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const Syntax = Schema.String.check(Schema.isPattern(/^[\s{}[\],:]*$/u));

/** Offsets and lengths address the post-insertion text; no config values are stored. */
const StructuralInverseSchema = Schema.Struct({
  beforeSha256: Sha256,
  afterSha256: Sha256,
  edits: Schema.Array(
    Schema.Struct({ offset: NonNegativeInteger, length: NonNegativeInteger, syntax: Syntax }),
  ),
});
export type StructuralInverse = typeof StructuralInverseSchema.Type;

const ContainerReceiptSchema = Schema.Struct({
  unit: Schema.NonEmptyString,
  kind: Schema.Literals([
    "created-file",
    "created-directory",
    "inserted-container",
    "inserted-key",
  ]),
  identity: ContainerIdentitySchema,
  contentSha256: Schema.optionalKey(Sha256),
  absentBefore: Schema.optionalKey(Schema.Boolean),
  inverse: Schema.optionalKey(StructuralInverseSchema),
});
export type ContainerReceipt = typeof ContainerReceiptSchema.Type;

const ContainerReceiptsSchema = Schema.Struct({
  version: Schema.Literal(1),
  entries: Schema.Array(ContainerReceiptSchema),
  createdDirectories: Schema.Array(ContainerIdentitySchema),
});
export type ContainerReceipts = typeof ContainerReceiptsSchema.Type;

export interface ContainerIdentityContext {
  readonly nativeRoot: string;
  readonly ownerRoot?: string;
  /** Runtime lifetime proof can use an existing ancestor before its workspace owner exists. */
  readonly identityOwnerRoot?: string;
  readonly target: string;
  readonly aliases?: ReadonlyArray<string>;
}

const identityOfObserved = (target: string, observed: NativeReferentObservation) =>
  Effect.gen(function* () {
    const { inode, birthtime } = observed;
    if (inode === undefined || birthtime === undefined || birthtime <= 0) {
      return yield* Effect.fail(
        new NativeLocationError({
          target,
          reason: "unreadable",
          cause: "entry-identity-unavailable",
        }),
      );
    }
    return { device: observed.device, inode, birthtime, mode: observed.mode };
  });

const identityOf = (target: string, info: FileSystem.File.Info) =>
  identityOfObserved(target, observeNativeReferent(info));

/** The live owner observation that opens every capture. */
const observeOwner = (ownerRoot: string, ownerPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ownerInfo = yield* fs.stat(ownerPath);
    if (ownerInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target: ownerRoot,
        reason: "unreadable",
        cause: "workspace-owner-not-directory",
      });
    const owner = { path: ownerPath, identity: yield* identityOf(ownerPath, ownerInfo) };
    return { ownerInfo, owner };
  });

/** One capture's resolved routes and owner observation, before the container is observed. */
interface AdmittedContainer {
  readonly nativeRoot: string;
  readonly ownerRoot: string;
  readonly identityOwnerRoot: string;
  readonly target: string;
  readonly aliases: ReadonlyArray<string>;
  readonly ownerInfo: FileSystem.File.Info;
  readonly owner: typeof LocatedIdentity.Type;
  readonly rootPath: string;
  readonly address: NativeEntryAddress;
  readonly referent: Option.Option<NativeReferentObservation>;
}

/** Observe the admitted container, its root, parents and aliases into its identity. */
const completeContainerIdentity = (admitted: AdmittedContainer) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { nativeRoot, ownerRoot, identityOwnerRoot, target, ownerInfo, owner, rootPath } =
      admitted;
    const { address, referent } = admitted;
    const physicalPath = address.referentPath;
    if (physicalPath === undefined || address.kind === "absent")
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "container-absent",
      });
    // A native root that is the identity owner was stat'd as the owner in this capture.
    const rootInfo = nativeRoot === identityOwnerRoot ? ownerInfo : yield* fs.stat(rootPath);
    if (rootInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target: nativeRoot,
        reason: "unreadable",
        cause: "native-root-not-directory",
      });
    const root = { path: rootPath, identity: yield* identityOf(rootPath, rootInfo) };
    // The resolution's followed stat already observed the object physicalPath names.
    const entryInfo = Option.isSome(referent)
      ? referent.value
      : observeNativeReferent(yield* fs.stat(physicalPath));
    if (entryInfo.type !== "File" && entryInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "container-shape-unsupported",
      });
    const entry = yield* identityOfObserved(physicalPath, entryInfo);
    const parents: Array<typeof LocatedIdentity.Type> = [];
    let parent = path.dirname(physicalPath);
    while (parent !== rootPath && physicalPath !== rootPath) {
      const info = yield* fs.stat(parent);
      if (info.type !== "Directory")
        return yield* new NativeLocationError({
          target: parent,
          reason: "unreadable",
          cause: "parent-not-directory",
        });
      parents.push({ path: parent, identity: yield* identityOf(parent, info) });
      const next = path.dirname(parent);
      if (next === parent) return yield* new NativeLocationError({ target, reason: "escape" });
      parent = next;
    }
    const aliases: Array<typeof AliasIdentity.Type> = [];
    for (const alias of [
      ...new Set([target, ...admitted.aliases.map((value) => path.resolve(value))]),
    ].sort()) {
      const resolved =
        alias === target ? address : yield* resolveNativeEntryWithin(alias, rootPath);
      if (resolved.referentPath !== physicalPath)
        return yield* new NativeLocationError({
          target: alias,
          reason: "unreadable",
          cause: "alias-does-not-address-container",
        });
      aliases.push({
        path: alias,
        entryPath: resolved.entryPath,
        referentPath: physicalPath,
        ...(resolved.linkTarget === undefined ? {} : { linkTarget: resolved.linkTarget }),
      });
    }
    return {
      nativeRoot,
      ownerRoot,
      identityOwnerRoot,
      target,
      physicalPath,
      owner,
      root,
      parents,
      entry,
      aliases,
    };
  });

const asCaptureFailure =
  (target: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        cause instanceof NativeLocationError
          ? cause
          : new NativeLocationError({ target, reason: "unreadable", cause }),
      ),
    );

/** Capture proof only after a successful managed creation/publication. */
export const captureContainerIdentity = (
  args: ContainerIdentityContext,
): Effect.Effect<ContainerIdentity, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const nativeRoot = path.resolve(args.nativeRoot);
    const ownerRoot = path.resolve(args.ownerRoot ?? nativeRoot);
    const identityOwnerRoot = path.resolve(args.identityOwnerRoot ?? ownerRoot);
    const ownerPath = yield* resolveNativeReferent(identityOwnerRoot);
    const { ownerInfo, owner } = yield* observeOwner(ownerRoot, ownerPath);
    const target = path.resolve(args.target);
    const rootPath =
      nativeRoot === identityOwnerRoot ? ownerPath : yield* resolveNativeReferent(nativeRoot);
    const physicalOwnerRoot =
      ownerRoot === identityOwnerRoot
        ? ownerPath
        : ownerRoot === nativeRoot
          ? rootPath
          : yield* resolveNativeReferent(ownerRoot);
    const { address, referent } = yield* resolveObservedNativeEntryWithin(target, rootPath);
    yield* assertResolvedNativeMutationWithin({
      physicalRoot: rootPath,
      physicalOwnerRoot,
      target,
      mutation: "content",
      address,
    });
    return yield* completeContainerIdentity({
      nativeRoot,
      ownerRoot,
      identityOwnerRoot,
      target,
      aliases: args.aliases ?? [],
      ownerInfo,
      owner,
      rootPath,
      address,
      referent,
    });
  }).pipe(asCaptureFailure(args.target));

/**
 * Admit a content mutation of `target` beneath `nativeRoot` exactly as
 * `assertNativeMutationWithin(nativeRoot, target, "content", ownerRoot)` does,
 * then capture its identity from that admission's own resolutions. The result
 * equals that admission followed at once by `captureContainerIdentity` of the
 * same context; every later capture or verification observes afresh.
 */
export const admitAndCaptureContainerIdentity = (args: {
  readonly nativeRoot: string;
  readonly ownerRoot: string;
  readonly target: string;
  readonly identityOwnerRoot?: never;
  readonly aliases?: never;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const admitted = yield* admitNativeMutationWithin(
      args.nativeRoot,
      args.target,
      "content",
      args.ownerRoot,
    );
    const identity = yield* Effect.gen(function* () {
      const nativeRoot = path.resolve(args.nativeRoot);
      const ownerRoot = path.resolve(args.ownerRoot);
      const { ownerInfo, owner } = yield* observeOwner(ownerRoot, admitted.physicalOwnerRoot);
      return yield* completeContainerIdentity({
        nativeRoot,
        ownerRoot,
        identityOwnerRoot: ownerRoot,
        target: path.resolve(args.target),
        aliases: [],
        ownerInfo,
        owner,
        rootPath: admitted.physicalRoot,
        address: admitted.address,
        referent: admitted.referent,
      });
    }).pipe(asCaptureFailure(args.target));
    return { address: admitted.address, identity };
  });

/** A copied workspace, recreated entry, replaced parent, or retargeted alias expires proof. */
export const verifyContainerIdentity = (
  identity: ContainerIdentity,
  current: ContainerIdentityContext,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  captureContainerIdentity(current).pipe(
    Effect.map((observed) => JSON.stringify(observed) === JSON.stringify(identity)),
    Effect.catch(() => Effect.succeed(false)),
  );

const sha256 = (text: string) =>
  Effect.sync(() => createHash("sha256").update(text).digest("hex")).pipe((effect) =>
    withWork("axm.hash.receipt", effect, {
      attributes: { "axm.work.count": 1, "axm.work.bytes": Buffer.byteLength(text) },
    }),
  );

/** Text bound to the receipt digest that hashed it; only this module creates one. */
class DigestedText {
  readonly #raw: string;
  readonly #sha256: string;
  constructor(raw: string, sha256: string) {
    this.#raw = raw;
    this.#sha256 = sha256;
  }
  get raw(): string {
    return this.#raw;
  }
  get sha256(): string {
    return this.#sha256;
  }
}

/** One receipt digest of `raw`, kept with the exact text it hashed. */
export const digestText = (raw: string): Effect.Effect<DigestedText> =>
  Effect.map(sha256(raw), (hash) => new DigestedText(raw, hash));

/** The inverse application of an already digested text; hashes only the restored result. */
export const applyDigestedStructuralInverse = (
  text: DigestedText,
  inverse: StructuralInverse,
): Effect.Effect<Option.Option<DigestedText>> =>
  Effect.gen(function* () {
    if (text.sha256 !== inverse.afterSha256) return Option.none();
    const edits = [...inverse.edits].sort((left, right) => right.offset - left.offset);
    let result = text.raw;
    let precedingStart = text.raw.length;
    for (const edit of edits) {
      if (
        !Number.isSafeInteger(edit.offset) ||
        !Number.isSafeInteger(edit.length) ||
        edit.offset < 0 ||
        edit.length < 0 ||
        edit.offset + edit.length > precedingStart ||
        !/^[\s{}[\],:]*$/.test(edit.syntax)
      )
        return Option.none();
      result = result.slice(0, edit.offset) + edit.syntax + result.slice(edit.offset + edit.length);
      precedingStart = edit.offset;
    }
    const restored = yield* digestText(result);
    return restored.sha256 === inverse.beforeSha256 ? Option.some(restored) : Option.none();
  });

/** The complete digest guard deliberately expires when unrelated intent changes the file. */
export const applyStructuralInverse = (
  raw: string,
  inverse: StructuralInverse,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const restored = yield* applyDigestedStructuralInverse(yield* digestText(raw), inverse);
    return Option.map(restored, (value) => value.raw);
  });

type StructuralEdit = StructuralInverse["edits"][number];

/** The syntax-only edits that restore `before` from `after`, or none when content changed. */
const structuralEdits = (before: string, after: string): Option.Option<Array<StructuralEdit>> => {
  if (before === after) return Option.none();
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const syntax = before.slice(prefix, before.length - suffix);
  if (/^[\s{}[\],:]*$/.test(syntax))
    return Option.some([{ offset: prefix, length: after.length - prefix - suffix, syntax }]);
  // A formatter may change several whitespace spans around an insertion.
  // Every significant original character must still occur in order in the
  // exact postimage; missing content cannot be reconstructed by this receipt.
  const edits: Array<StructuralEdit> = [];
  let beforeCursor = 0;
  let afterCursor = 0;
  for (const match of before.matchAll(/[^\s{}[\],:]/gu)) {
    const found = after.indexOf(match[0], afterCursor);
    if (found < 0) return Option.none();
    const syntax = before.slice(beforeCursor, match.index);
    if (after.slice(afterCursor, found) !== syntax)
      edits.push({ offset: afterCursor, length: found - afterCursor, syntax });
    beforeCursor = match.index + match[0].length;
    afterCursor = found + match[0].length;
  }
  const remainingSyntax = before.slice(beforeCursor);
  if (after.slice(afterCursor) !== remainingSyntax)
    edits.push({
      offset: afterCursor,
      length: after.length - afterCursor,
      syntax: remainingSyntax,
    });
  return Option.some(edits);
};

/** True exactly when `deriveStructuralInverse` would yield a receipt; computes no digest. */
export const isStructuralInsertion = (before: string, after: string): boolean =>
  Option.isSome(structuralEdits(before, after));

/** Retain significant preimage characters in place; persist only syntax and edit positions. */
export const deriveStructuralInverse = (
  before: string,
  after: string,
): Effect.Effect<Option.Option<StructuralInverse>> =>
  Effect.gen(function* () {
    const edits = structuralEdits(before, after);
    if (Option.isNone(edits)) return Option.none();
    return Option.some({
      beforeSha256: yield* sha256(before),
      afterSha256: yield* sha256(after),
      edits: edits.value,
    });
  });

/** These callbacks supply the existing transaction and serialization boundaries. */
export interface ContainerReceiptMutation<E, R> {
  readonly withLock: <A, E2, R2>(
    target: string,
    effect: Effect.Effect<A, E2, R2>,
  ) => Effect.Effect<A, E | E2, R | R2>;
  /** Current admission's exclusive creation proof, persisted in this same store. */
  readonly inheritedDirectories?: Effect.Effect<ReadonlyArray<ContainerIdentity>, E, R>;
  readonly createDirectory: (target: string) => Effect.Effect<boolean, E, R>;
  /**
   * `prior` is the store text this update read under `withLock`, or none when
   * the store was absent. The writer still owns authorization, protection,
   * and the decision to skip identical bytes.
   */
  readonly write: (
    target: string,
    contents: string,
    prior: { readonly text: Option.Option<string> },
  ) => Effect.Effect<void, E, R>;
  readonly retire: (target: string) => Effect.Effect<void, E, R>;
}

const receiptPath = (path: Path.Path, workspaceDir: string): string =>
  path.join(workspaceDir, "projection-containers.json");

/** The decoded store and the exact text it was decoded from, or none when absent. */
const readContainerReceiptsText = (
  workspaceDir: string,
): Effect.Effect<
  { readonly receipts: ContainerReceipts; readonly text: Option.Option<string> },
  NativeLocationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = receiptPath(path, workspaceDir);
    const address = yield* resolveNativeEntry(target);
    if (address.kind === "absent")
      return {
        receipts: { version: 1, entries: [], createdDirectories: [] } satisfies ContainerReceipts,
        text: Option.none(),
      };
    if (address.kind !== "file")
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "receipt-file-not-ordinary",
      });
    const text = yield* fs
      .readFileString(target)
      .pipe(
        Effect.mapError(
          () =>
            new NativeLocationError({ target, reason: "unreadable", cause: "receipt-read-failed" }),
        ),
      );
    const receipts = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ContainerReceiptsSchema),
      { onExcessProperty: "error" },
    )(text).pipe(
      (effect) => withWork("axm.parse.receipts", effect, { attributes: { "axm.work.count": 1 } }),
      Effect.mapError(
        () =>
          new NativeLocationError({
            target,
            reason: "unreadable",
            cause: "invalid-container-receipts",
          }),
      ),
    );
    return { receipts, text: Option.some(text) };
  });

export const readContainerReceipts = (
  workspaceDir: string,
): Effect.Effect<ContainerReceipts, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.map(readContainerReceiptsText(workspaceDir), ({ receipts }) => receipts);

type ReceiptChange = (entries: ReadonlyArray<ContainerReceipt>) => ReadonlyArray<ContainerReceipt>;

/** Store text read under the lock, with the decoded receipts it holds. */
type LockedStore = Effect.Success<ReturnType<typeof readContainerReceiptsText>>;

/** Empty `entries` retire the store and its proven empty created directories. */
const retireStore = <E, R>(
  target: string,
  current: ContainerReceipts,
  mutation: ContainerReceiptMutation<E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* mutation.retire(target);
    for (const identity of [...current.createdDirectories].sort(
      (left, right) => right.physicalPath.length - left.physicalPath.length,
    )) {
      if (
        !(yield* verifyContainerIdentity(identity, {
          nativeRoot: identity.nativeRoot,
          ownerRoot: identity.ownerRoot,
          identityOwnerRoot: identity.identityOwnerRoot,
          target: identity.target,
        })) ||
        (yield* fs.readDirectory(identity.physicalPath).pipe(
          Effect.mapError(
            (cause) =>
              new NativeLocationError({
                target: identity.target,
                reason: "unreadable",
                cause,
              }),
          ),
        )).length !== 0
      )
        continue;
      yield* mutation.retire(identity.physicalPath);
    }
  });

/** Publish non-empty `entries` over the locked read, merging this admission's created directories. */
const publishStore = <E, R>(
  workspaceDir: string,
  target: string,
  locked: LockedStore,
  entries: ReadonlyArray<ContainerReceipt>,
  mutation: ContainerReceiptMutation<E, R>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const createdDirectories = [...locked.receipts.createdDirectories];
    for (const identity of yield* mutation.inheritedDirectories ?? Effect.succeed([])) {
      if (
        !createdDirectories.some((entry) => entry.physicalPath === identity.physicalPath) &&
        (yield* verifyContainerIdentity(identity, {
          nativeRoot: identity.nativeRoot,
          ownerRoot: identity.ownerRoot,
          identityOwnerRoot: identity.identityOwnerRoot,
          target: identity.target,
        }))
      )
        createdDirectories.push(identity);
    }
    const reference = entries[0]?.identity;
    if (reference !== undefined) {
      const missing: string[] = [];
      let ancestor = path.dirname(target);
      while (
        !(yield* fs
          .exists(ancestor)
          .pipe(
            Effect.mapError(
              (cause) => new NativeLocationError({ target: ancestor, reason: "unreadable", cause }),
            ),
          ))
      ) {
        missing.push(ancestor);
        const parent = path.dirname(ancestor);
        if (parent === ancestor)
          return yield* new NativeLocationError({ target, reason: "unreadable" });
        ancestor = parent;
      }
      // The store belongs to this workspace, independently of the native
      // root addressed by its first receipt. Writes remain callback-authorized.
      const proof = {
        nativeRoot: ancestor,
        ownerRoot: path.dirname(workspaceDir),
        target: ancestor,
      };
      const anchor = yield* captureContainerIdentity(proof);
      const createsAncestors = missing.length > 0;
      for (const directory of missing.reverse()) {
        if (!(yield* verifyContainerIdentity(anchor, proof)))
          return yield* new NativeLocationError({
            target,
            reason: "unreadable",
            cause: "receipt-store-parent-changed",
          });
        const created = yield* mutation.createDirectory(directory);
        const identity = yield* captureContainerIdentity({ ...proof, target: directory });
        if (created) createdDirectories.push(identity);
      }
      // Re-prove the anchor only around creation. With no missing ancestor,
      // the capture above is the proof and the writer authorizes and protects.
      if (createsAncestors && !(yield* verifyContainerIdentity(anchor, proof)))
        return yield* new NativeLocationError({
          target,
          reason: "unreadable",
          cause: "receipt-store-parent-changed",
        });
    }
    // Decode before persisting even when a caller supplies typed values.
    const next = yield* Schema.decodeUnknownEffect(ContainerReceiptsSchema, {
      onExcessProperty: "error",
    })({ version: 1, entries, createdDirectories }).pipe(
      (effect) => withWork("axm.parse.receipts", effect, { attributes: { "axm.work.count": 1 } }),
      Effect.mapError(
        () =>
          new NativeLocationError({
            target,
            reason: "unreadable",
            cause: "invalid-container-receipts",
          }),
      ),
    );
    yield* mutation.write(target, `${JSON.stringify(next, null, 2)}\n`, { text: locked.text });
  });

/** True when `entries` would leave the locked store as it is. */
const unchanged = (
  entries: ReadonlyArray<ContainerReceipt>,
  current: ReadonlyArray<ContainerReceipt>,
): boolean => JSON.stringify(entries) === JSON.stringify(current);

/**
 * The states, by index, that one physical step each publishes (or retires when
 * empty) so the store ends as one update per change would leave it, with
 * the same final state, the same footprint labels (`created` for a write to an
 * absent store, `modified` for a write over one, `removed` for a retirement),
 * and the same created directories retired. Consecutive writes collapse into
 * the last one, except the first write to an absent store, and a last write
 * that would equal the state before it, which keep a write of their own.
 */
const storeSteps = (
  states: ReadonlyArray<ReadonlyArray<ContainerReceipt>>,
  present: boolean,
): ReadonlyArray<number> => {
  const steps: Array<number> = [];
  let onDisk = 0;
  let exists = present;
  let writes: Array<number> = [];
  const flush = () => {
    const first = writes[0];
    const last = writes[writes.length - 1];
    writes = [];
    if (first === undefined || last === undefined) return;
    if (!exists) {
      steps.push(first);
      onDisk = first;
      exists = true;
      if (last === first) return;
    }
    if (unchanged(states[last] ?? [], states[onDisk] ?? [])) steps.push(last - 1);
    steps.push(last);
    onDisk = last;
  };
  for (let index = 1; index < states.length; index++) {
    const state = states[index] ?? [];
    if (unchanged(state, states[index - 1] ?? [])) continue;
    if (state.length > 0) {
      writes.push(index);
      continue;
    }
    flush();
    steps.push(index);
    onDisk = index;
    exists = false;
  }
  flush();
  return steps;
};

export const updateContainerReceipts = <E, R>(
  workspaceDir: string,
  change: ReceiptChange,
  mutation: ContainerReceiptMutation<E, R>,
) => updateContainerReceiptsSequence(workspaceDir, [change], mutation);

/**
 * Apply `changes` in order under one lock and one locked read, with the same
 * store states, footprint labels and retired created directories as one
 * update per change. Every step after the first re-reads the store under the
 * same hold and applies the changes since the previous step to what it names.
 */
export const updateContainerReceiptsSequence = <E, R>(
  workspaceDir: string,
  changes: ReadonlyArray<ReceiptChange>,
  mutation: ContainerReceiptMutation<E, R>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const target = receiptPath(path, workspaceDir);
    if (changes.length === 0) return;
    return yield* mutation.withLock(
      target,
      Effect.gen(function* () {
        let current = yield* readContainerReceiptsText(workspaceDir);
        const states: Array<ReadonlyArray<ContainerReceipt>> = [current.receipts.entries];
        for (const change of changes) states.push(change(states[states.length - 1] ?? []));
        let applied = 0;
        for (const [position, index] of storeSteps(states, Option.isSome(current.text)).entries()) {
          if (position > 0) current = yield* readContainerReceiptsText(workspaceDir);
          let entries = current.receipts.entries;
          for (const change of changes.slice(applied, index)) entries = change(entries);
          applied = index;
          yield* entries.length === 0
            ? retireStore(target, current.receipts, mutation)
            : publishStore(workspaceDir, target, current, entries, mutation);
        }
      }),
    );
  });
