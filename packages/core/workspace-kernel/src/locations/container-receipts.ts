import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  assertNativeMutationWithin,
  NativeLocationError,
  resolveNativeEntry,
  resolveNativeReferent,
} from "./native-address.js";

const EntryIdentity = Schema.Struct({
  device: Schema.Number,
  inode: Schema.Number,
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
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const Syntax = Schema.String.check(Schema.isPattern(/^[\s{}[\],:]*$/));

/** Offsets and lengths address the post-insertion text; no config values are stored. */
export const StructuralInverseSchema = Schema.Struct({
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

const identityOf = (target: string, info: FileSystem.File.Info) => {
  if (
    Option.isNone(info.ino) ||
    info.ino.value <= 0 ||
    Option.isNone(info.birthtime) ||
    info.birthtime.value.getTime() <= 0
  ) {
    return Effect.fail(
      new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "entry-identity-unavailable",
      }),
    );
  }
  return Effect.succeed({
    device: info.dev,
    inode: info.ino.value,
    birthtime: info.birthtime.value.getTime(),
    mode: info.mode,
  });
};

/** Capture proof only after a successful managed creation/publication. */
export const captureContainerIdentity = (
  args: ContainerIdentityContext,
): Effect.Effect<ContainerIdentity, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const nativeRoot = path.resolve(args.nativeRoot);
    const ownerRoot = path.resolve(args.ownerRoot ?? nativeRoot);
    const identityOwnerRoot = path.resolve(args.identityOwnerRoot ?? ownerRoot);
    const ownerPath = yield* resolveNativeReferent(identityOwnerRoot);
    const ownerInfo = yield* fs.stat(ownerPath);
    if (ownerInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target: ownerRoot,
        reason: "unreadable",
        cause: "workspace-owner-not-directory",
      });
    const owner = { path: ownerPath, identity: yield* identityOf(ownerPath, ownerInfo) };
    const target = path.resolve(args.target);
    const address = yield* assertNativeMutationWithin(nativeRoot, target, "content", ownerRoot);
    const physicalPath = address.referentPath;
    if (physicalPath === undefined || address.kind === "absent")
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "container-absent",
      });
    const rootPath = yield* resolveNativeReferent(nativeRoot);
    const rootInfo = yield* fs.stat(rootPath);
    if (rootInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target: nativeRoot,
        reason: "unreadable",
        cause: "native-root-not-directory",
      });
    const root = { path: rootPath, identity: yield* identityOf(rootPath, rootInfo) };
    const entryInfo = yield* fs.stat(physicalPath);
    if (entryInfo.type !== "File" && entryInfo.type !== "Directory")
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "container-shape-unsupported",
      });
    const entry = yield* identityOf(physicalPath, entryInfo);
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
      ...new Set([target, ...(args.aliases ?? []).map((value) => path.resolve(value))]),
    ].sort()) {
      const resolved = yield* resolveNativeEntry(alias);
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
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof NativeLocationError
        ? cause
        : new NativeLocationError({ target: args.target, reason: "unreadable", cause }),
    ),
  );

/** A copied workspace, recreated entry, replaced parent, or retargeted alias expires proof. */
export const verifyContainerIdentity = (
  identity: ContainerIdentity,
  current: ContainerIdentityContext,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  captureContainerIdentity(current).pipe(
    Effect.map((observed) => JSON.stringify(observed) === JSON.stringify(identity)),
    Effect.catch(() => Effect.succeed(false)),
  );

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The complete digest guard deliberately expires when unrelated intent changes the file. */
export const applyStructuralInverse = (
  raw: string,
  inverse: StructuralInverse,
): Option.Option<string> => {
  if (sha256(raw) !== inverse.afterSha256) return Option.none();
  const edits = [...inverse.edits].sort((left, right) => right.offset - left.offset);
  let result = raw;
  let precedingStart = raw.length;
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
  return sha256(result) === inverse.beforeSha256 ? Option.some(result) : Option.none();
};

/** Retain significant preimage characters in place; persist only syntax and edit positions. */
export const deriveStructuralInverse = (
  before: string,
  after: string,
): Option.Option<StructuralInverse> => {
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
  if (/^[\s{}[\],:]*$/.test(syntax)) {
    return Option.some({
      beforeSha256: sha256(before),
      afterSha256: sha256(after),
      edits: [{ offset: prefix, length: after.length - prefix - suffix, syntax }],
    });
  }
  // A formatter may change several whitespace spans around an insertion.
  // Every significant original character must still occur in order in the
  // exact postimage; missing content cannot be reconstructed by this receipt.
  const edits: Array<{
    readonly offset: number;
    readonly length: number;
    readonly syntax: string;
  }> = [];
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
  return Option.some({ beforeSha256: sha256(before), afterSha256: sha256(after), edits });
};

/** These callbacks supply the existing transaction and serialization boundaries. */
export interface ContainerReceiptMutation<E, R> {
  readonly withLock: <A, E2, R2>(
    target: string,
    effect: Effect.Effect<A, E2, R2>,
  ) => Effect.Effect<A, E | E2, R | R2>;
  /** Current admission's exclusive creation proof, persisted in this same store. */
  readonly inheritedDirectories?: Effect.Effect<ReadonlyArray<ContainerIdentity>, E, R>;
  readonly createDirectory: (target: string) => Effect.Effect<boolean, E, R>;
  readonly write: (target: string, contents: string) => Effect.Effect<void, E, R>;
  readonly retire: (target: string) => Effect.Effect<void, E, R>;
}

const receiptPath = (path: Path.Path, workspaceDir: string): string =>
  path.join(workspaceDir, "projection-containers.json");

export const readContainerReceipts = (
  workspaceDir: string,
): Effect.Effect<ContainerReceipts, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = receiptPath(path, workspaceDir);
    const address = yield* resolveNativeEntry(target);
    if (address.kind === "absent")
      return { version: 1, entries: [], createdDirectories: [] } satisfies ContainerReceipts;
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
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ContainerReceiptsSchema), {
      onExcessProperty: "error",
    })(text).pipe(
      Effect.mapError(
        () =>
          new NativeLocationError({
            target,
            reason: "unreadable",
            cause: "invalid-container-receipts",
          }),
      ),
    );
  });

export const updateContainerReceipts = <E, R>(
  workspaceDir: string,
  change: (entries: ReadonlyArray<ContainerReceipt>) => ReadonlyArray<ContainerReceipt>,
  mutation: ContainerReceiptMutation<E, R>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const target = receiptPath(path, workspaceDir);
    return yield* mutation.withLock(
      target,
      Effect.gen(function* () {
        const current = yield* readContainerReceipts(workspaceDir);
        const entries = change(current.entries);
        if (JSON.stringify(entries) === JSON.stringify(current.entries)) return;
        if (entries.length === 0) {
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
        } else {
          const createdDirectories = [...current.createdDirectories];
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
                    (cause) =>
                      new NativeLocationError({ target: ancestor, reason: "unreadable", cause }),
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
            if (!(yield* verifyContainerIdentity(anchor, proof)))
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
            Effect.mapError(
              () =>
                new NativeLocationError({
                  target,
                  reason: "unreadable",
                  cause: "invalid-container-receipts",
                }),
            ),
          );
          yield* mutation.write(target, `${JSON.stringify(next, null, 2)}\n`);
        }
      }),
    );
  });

export const recordContainerReceipt = <E, R>(
  workspaceDir: string,
  receipt: ContainerReceipt,
  mutation: ContainerReceiptMutation<E, R>,
): Effect.Effect<void, E | NativeLocationError, R | FileSystem.FileSystem | Path.Path> =>
  updateContainerReceipts(
    workspaceDir,
    (entries) => [
      ...entries.filter(
        (entry) =>
          entry.unit !== receipt.unit ||
          entry.identity.physicalPath !== receipt.identity.physicalPath ||
          entry.kind !== receipt.kind,
      ),
      receipt,
    ],
    mutation,
  );

export const forgetContainerReceipt = <E, R>(
  workspaceDir: string,
  unit: { readonly unit: string; readonly physicalPath: string },
  mutation: ContainerReceiptMutation<E, R>,
): Effect.Effect<void, E | NativeLocationError, R | FileSystem.FileSystem | Path.Path> =>
  updateContainerReceipts(
    workspaceDir,
    (entries) =>
      entries.filter(
        (entry) => entry.unit !== unit.unit || entry.identity.physicalPath !== unit.physicalPath,
      ),
    mutation,
  );
