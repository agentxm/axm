import { sha512Integrity } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { resolveNativeEntry } from "./native-address.js";

export const COPIED_DIRECTORY_RECEIPT = ".axm-copy.json";

const Identity = Schema.Struct({
  device: Schema.Number,
  inode: Schema.Number,
  birthtime: Schema.Number,
  mode: Schema.Number,
});
const Receipt = Schema.Struct({
  version: Schema.Literal(1),
  source: Schema.String,
  identity: Identity,
  files: Schema.Array(
    Schema.Struct({ path: Schema.String, integrity: Schema.String, identity: Identity }),
  ),
  directories: Schema.Array(Schema.Struct({ path: Schema.String, identity: Identity })),
});
export type CopiedDirectoryReceipt = typeof Receipt.Type;

const sameIdentity = (left: typeof Identity.Type, right: typeof Identity.Type) =>
  left.device === right.device &&
  left.inode === right.inode &&
  left.birthtime === right.birthtime &&
  left.mode === right.mode;

const identityOf = (info: FileSystem.File.Info) =>
  Option.all({ inode: info.ino, birthtime: info.birthtime }).pipe(
    Option.filter(({ inode, birthtime }) => inode > 0 && birthtime.getTime() > 0),
    Option.map(({ inode, birthtime }) => ({
      device: info.dev,
      inode,
      birthtime: birthtime.getTime(),
      mode: info.mode,
    })),
  );

/** Record exactly the files created by a copy. The root identity expires on replacement. */
export const captureCopiedDirectory = (directory: string, source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const identity = identityOf(yield* fs.stat(directory));
    if (Option.isNone(identity)) return Option.none<CopiedDirectoryReceipt>();
    const files: Array<{ path: string; integrity: string; identity: typeof Identity.Type }> = [];
    const directories: Array<{ path: string; identity: typeof Identity.Type }> = [];
    const pending = [""];
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(directory, relative))) {
        if (name === COPIED_DIRECTORY_RECEIPT) continue;
        const child = path.join(relative, name);
        const absolute = path.join(directory, child);
        const address = yield* resolveNativeEntry(absolute);
        const childIdentity = identityOf(yield* fs.stat(absolute));
        if (Option.isNone(childIdentity)) return Option.none<CopiedDirectoryReceipt>();
        if (address.kind === "directory") {
          directories.push({ path: child, identity: childIdentity.value });
          pending.push(child);
        } else if (address.kind === "file") {
          files.push({
            path: child,
            integrity: sha512Integrity(yield* fs.readFile(absolute)),
            identity: childIdentity.value,
          });
        }
      }
    }
    const receipt = { version: 1, source, identity: identity.value, files, directories } as const;
    yield* fs.writeFileString(
      path.join(directory, COPIED_DIRECTORY_RECEIPT),
      JSON.stringify(receipt),
    );
    return Option.some(receipt);
  });

/** Invalid, missing, replaced, or symlinked copies carry no deletion authority. */
export const readCopiedDirectory = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const address = yield* resolveNativeEntry(directory);
    if (address.kind !== "directory") return Option.none<CopiedDirectoryReceipt>();
    const receiptPath = path.join(directory, COPIED_DIRECTORY_RECEIPT);
    const receiptAddress = yield* resolveNativeEntry(receiptPath);
    if (receiptAddress.kind !== "file") return Option.none<CopiedDirectoryReceipt>();
    const receipt = yield* fs
      .readFileString(receiptPath)
      .pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Receipt))),
        Effect.option,
      );
    if (Option.isNone(receipt)) return receipt;
    const current = identityOf(yield* fs.stat(directory));
    if (Option.isNone(current)) return Option.none<CopiedDirectoryReceipt>();
    const expected = receipt.value.identity;
    if (!sameIdentity(current.value, expected)) return Option.none<CopiedDirectoryReceipt>();
    const relativePaths = [
      ...receipt.value.files.map((file) => file.path),
      ...receipt.value.directories.map((directory) => directory.path),
    ];
    if (
      relativePaths.some(
        (relative) =>
          relative === "" || path.isAbsolute(relative) || relative.split(/[\\/]/).includes(".."),
      )
    )
      return Option.none<CopiedDirectoryReceipt>();
    return receipt;
  }).pipe(Effect.catch(() => Effect.succeedNone));

/** Only unchanged, ordinary files from the receipt are eligible for retirement. */
export const unchangedCopiedFiles = (directory: string, receipt: CopiedDirectoryReceipt) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* Effect.filter(receipt.files, (file) =>
      Effect.gen(function* () {
        const absolute = path.join(directory, file.path);
        const address = yield* resolveNativeEntry(absolute);
        if (address.kind !== "file" || address.entryPath !== absolute) return false;
        const identity = identityOf(yield* fs.stat(absolute));
        if (Option.isNone(identity) || !sameIdentity(identity.value, file.identity)) return false;
        return sha512Integrity(yield* fs.readFile(absolute)) === file.integrity;
      }).pipe(Effect.catch(() => Effect.succeed(false))),
    );
  });

/** A replacement requires the complete old copy to remain owned, with no foreign additions. */
export const copiedDirectoryCanReplace = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const receipt = yield* readCopiedDirectory(directory);
    if (
      Option.isNone(receipt) ||
      (yield* unchangedCopiedFiles(directory, receipt.value)).length !== receipt.value.files.length
    )
      return false;
    const expected = new Set([
      ...receipt.value.files.map((entry) => entry.path),
      ...receipt.value.directories.map((entry) => entry.path),
    ]);
    const pending = [""];
    let observed = 0;
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(directory, relative))) {
        if (relative === "" && name === COPIED_DIRECTORY_RECEIPT) continue;
        const child = path.join(relative, name);
        if (!expected.has(child)) return false;
        observed += 1;
        const expectedDirectory = receipt.value.directories.find((entry) => entry.path === child);
        if (expectedDirectory === undefined) continue;
        const absolute = path.join(directory, child);
        const address = yield* resolveNativeEntry(absolute);
        const identity = identityOf(yield* fs.stat(absolute));
        if (
          address.kind !== "directory" ||
          address.entryPath !== absolute ||
          Option.isNone(identity) ||
          !sameIdentity(identity.value, expectedDirectory.identity)
        )
          return false;
        pending.push(child);
      }
    }
    return observed === expected.size;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** Retire receipt-listed content only; additions and modified files remain foreign. */
export const retireCopiedDirectory = <E = never, R = never>(
  directory: string,
  remove?: (path: string) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const receipt = yield* readCopiedDirectory(directory);
    if (Option.isNone(receipt)) return false;
    for (const file of yield* unchangedCopiedFiles(directory, receipt.value)) {
      const target = path.join(directory, file.path);
      yield* remove === undefined ? fs.remove(target) : remove(target);
    }
    for (const entry of [...receipt.value.directories].sort(
      (a, b) => b.path.length - a.path.length,
    )) {
      const child = path.join(directory, entry.path);
      const address = yield* resolveNativeEntry(child);
      if (address.kind !== "directory" || address.entryPath !== child) continue;
      const identity = identityOf(yield* fs.stat(child));
      if (
        Option.isSome(identity) &&
        sameIdentity(identity.value, entry.identity) &&
        (yield* fs.readDirectory(child)).length === 0
      ) {
        yield* remove === undefined ? fs.remove(child, { recursive: true }) : remove(child);
      }
    }
    const receiptPath = path.join(directory, COPIED_DIRECTORY_RECEIPT);
    yield* remove === undefined ? fs.remove(receiptPath) : remove(receiptPath);
    if ((yield* fs.readDirectory(directory)).length === 0) {
      yield* remove === undefined ? fs.remove(directory, { recursive: true }) : remove(directory);
    }
    return true;
  });

/** Repeated synchronization does not rewrite a current bounded copy or its foreign siblings. */
export const copiedDirectoryIsCurrent = (directory: string, source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const receipt = yield* readCopiedDirectory(directory);
    if (Option.isNone(receipt) || receipt.value.source !== source) return false;
    const currentFiles = yield* unchangedCopiedFiles(directory, receipt.value);
    if (currentFiles.length !== receipt.value.files.length) return false;
    const expected = new Map(receipt.value.files.map((file) => [file.path, file.integrity]));
    const pending = [""];
    const visited = new Set<string>();
    let seen = 0;
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(source, relative))) {
        if (
          name === ".git" ||
          name === "README.md" ||
          name === "metadata.json" ||
          name === COPIED_DIRECTORY_RECEIPT ||
          name.startsWith("_")
        )
          continue;
        const child = path.join(relative, name);
        const absolute = path.join(source, child);
        const info = yield* fs.stat(absolute);
        if (info.type === "Directory") {
          const real = yield* fs.realPath(absolute);
          if (visited.has(real)) return false;
          visited.add(real);
          pending.push(child);
        } else {
          if (
            ++seen > expected.size ||
            sha512Integrity(yield* fs.readFile(absolute)) !== expected.get(child)
          )
            return false;
        }
      }
    }
    return seen === expected.size;
  }).pipe(Effect.catch(() => Effect.succeed(false)));
