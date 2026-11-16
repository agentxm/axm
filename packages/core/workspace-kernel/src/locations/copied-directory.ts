import { sha512Integrity } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  NativeLocationError,
  observeNativeReferent,
  resolveNativeEntry,
  resolveObservedNativeEntry,
  type NativeEntryAddress,
  type NativeReferentObservation,
  type ObservedNativeEntry,
} from "./native-address.js";
import { containedLinkValidator } from "./contained-link.js";
import { nativeLinkIdentity } from "./native-inode.js";

/** Management evidence is a sibling, never an upstream payload member. */
export const copiedDirectoryReceiptPath = (directory: string) =>
  Effect.map(Path.Path, (path) =>
    path.join(path.dirname(directory), `.${path.basename(directory)}.axm-copy.json`),
  );

const LinkIdentity = Schema.Struct({
  device: Schema.String,
  inode: Schema.String,
  birthtime: Schema.Number,
});

const Identity = Schema.Struct({
  device: Schema.String,
  inode: Schema.String,
  birthtime: Schema.Number,
  mode: Schema.Number,
});
const Receipt = Schema.Struct({
  version: Schema.Literal(2),
  source: Schema.String,
  identity: Identity,
  files: Schema.Array(
    Schema.Struct({ path: Schema.String, integrity: Schema.String, identity: Identity }),
  ),
  links: Schema.Array(
    Schema.Struct({ path: Schema.String, target: Schema.String, identity: LinkIdentity }),
  ),
  directories: Schema.Array(Schema.Struct({ path: Schema.String, identity: Identity })),
});
export type CopiedDirectoryReceipt = typeof Receipt.Type;

const sameIdentity = (left: typeof Identity.Type, right: typeof Identity.Type) =>
  left.device === right.device &&
  left.inode === right.inode &&
  left.birthtime === right.birthtime &&
  left.mode === right.mode;

const identityOfObserved = ({ device, inode, birthtime, mode }: NativeReferentObservation) =>
  inode === undefined || birthtime === undefined || !(birthtime > 0)
    ? Option.none()
    : Option.some({ device, inode, birthtime, mode });

const identityOf = (info: FileSystem.File.Info) => identityOfObserved(observeNativeReferent(info));

/** The identity of an ordinary entry from the followed stat that resolved it. */
const observedIdentity = (observed: ObservedNativeEntry) =>
  Option.flatMap(observed.referent, identityOfObserved);

/** Record exactly the files created by a copy. The root identity expires on replacement. */
export const captureCopiedDirectory = (directory: string, source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const receiptPath = yield* copiedDirectoryReceiptPath(directory);
    if ((yield* resolveNativeEntry(receiptPath)).kind !== "absent")
      return yield* new NativeLocationError({ target: receiptPath, reason: "workspace-conflict" });
    const identity = identityOf(yield* fs.stat(directory));
    if (Option.isNone(identity)) return Option.none<CopiedDirectoryReceipt>();
    const files: Array<{ path: string; integrity: string; identity: typeof Identity.Type }> = [];
    const links: Array<CopiedDirectoryReceipt["links"][number]> = [];
    const directories: Array<{ path: string; identity: typeof Identity.Type }> = [];
    const validateContainedLink = containedLinkValidator(directory);
    const pending = [""];
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(directory, relative))) {
        const child = path.join(relative, name);
        const absolute = path.join(directory, child);
        const observed = yield* resolveObservedNativeEntry(absolute);
        const address = observed.address;
        if (address.kind === "symlink" && address.linkTarget !== undefined) {
          yield* validateContainedLink(absolute, address.linkTarget);
          const linkIdentity = yield* nativeLinkIdentity(absolute);
          if (Option.isNone(linkIdentity)) return Option.none<CopiedDirectoryReceipt>();
          links.push({ path: child, target: address.linkTarget, identity: linkIdentity.value });
          continue;
        }
        // An ordinary entry's resolution already stat'd it; anything else is observed live.
        const childIdentity =
          address.kind === "file" || address.kind === "directory"
            ? observedIdentity(observed)
            : identityOf(yield* fs.stat(absolute));
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
        } else return Option.none<CopiedDirectoryReceipt>();
      }
    }
    const receipt = {
      version: 2,
      source,
      identity: identity.value,
      files,
      directories,
      links,
    } as const;
    yield* fs.writeFileString(receiptPath, JSON.stringify(receipt), { flag: "wx" });
    return Option.some(receipt);
  });

/** Invalid, missing, replaced, or symlinked copies carry no deletion authority. */
export const readCopiedDirectory = (directory: string) =>
  Effect.gen(function* () {
    const observed = yield* resolveObservedNativeEntry(directory);
    // The resolution's followed stat is the directory's current identity.
    return yield* readResolvedCopiedDirectory(directory, observed.address, () =>
      Effect.succeed(observedIdentity(observed)),
    );
  }).pipe(Effect.catch(() => Effect.succeedNone));

const readResolvedCopiedDirectory = <E, R>(
  directory: string,
  address: NativeEntryAddress,
  currentIdentity: () => Effect.Effect<Option.Option<typeof Identity.Type>, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (address.kind !== "directory") return Option.none<CopiedDirectoryReceipt>();
    const receiptPath = yield* copiedDirectoryReceiptPath(directory);
    const receiptAddress = yield* resolveNativeEntry(receiptPath);
    if (receiptAddress.kind !== "file") return Option.none<CopiedDirectoryReceipt>();
    const receipt = yield* fs
      .readFileString(receiptPath)
      .pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Receipt))),
        Effect.option,
      );
    if (Option.isNone(receipt)) return receipt;
    const current = yield* currentIdentity();
    if (Option.isNone(current)) return Option.none<CopiedDirectoryReceipt>();
    const expected = receipt.value.identity;
    if (!sameIdentity(current.value, expected)) return Option.none<CopiedDirectoryReceipt>();
    const relativePaths = [
      ...receipt.value.files.map((file) => file.path),
      ...receipt.value.links.map((link) => link.path),
      ...receipt.value.directories.map((directory) => directory.path),
    ];
    if (
      relativePaths.some(
        (relative) =>
          relative === "" ||
          relative === "." ||
          path.normalize(relative) !== relative ||
          path.isAbsolute(relative) ||
          relative.split(/[\\/]/).includes(".."),
      )
    )
      return Option.none<CopiedDirectoryReceipt>();
    return receipt;
  });

/** Only unchanged, ordinary files from the receipt are eligible for retirement. */
const unchangedCopiedFiles = (directory: string, receipt: CopiedDirectoryReceipt) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* Effect.filter(receipt.files, (file) =>
      Effect.gen(function* () {
        const absolute = path.join(directory, file.path);
        const observed = yield* resolveObservedNativeEntry(absolute);
        const address = observed.address;
        if (address.kind !== "file" || address.entryPath !== absolute) return false;
        const identity = observedIdentity(observed);
        if (Option.isNone(identity) || !sameIdentity(identity.value, file.identity)) return false;
        return sha512Integrity(yield* fs.readFile(absolute)) === file.integrity;
      }).pipe(Effect.catch(() => Effect.succeed(false))),
    );
  });

/** Link ownership requires the original link entry and unchanged target text. */
const unchangedCopiedLinks = (directory: string, receipt: CopiedDirectoryReceipt) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* Effect.filter(receipt.links, (link) =>
      Effect.gen(function* () {
        const absolute = path.join(directory, link.path);
        const address = yield* resolveNativeEntry(absolute);
        if (address.kind !== "symlink" || address.entryPath !== absolute) return false;
        const identity = yield* nativeLinkIdentity(absolute);
        return (
          Option.isSome(identity) &&
          identity.value.device === link.identity.device &&
          identity.value.inode === link.identity.inode &&
          identity.value.birthtime === link.identity.birthtime &&
          (yield* fs.readLink(absolute)) === link.target
        );
      }).pipe(Effect.catch(() => Effect.succeed(false))),
    );
  });

/** Exact child ownership from a live creation receipt, without claiming foreign siblings. */
export const copiedDirectoryOwnsPath = (directory: string, target: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const receipt = yield* readCopiedDirectory(directory);
    if (Option.isNone(receipt)) return false;
    const relative = path.relative(directory, target);
    const files = receipt.value.files.filter((entry) => entry.path === relative);
    if (files.length > 0)
      return (yield* unchangedCopiedFiles(directory, { ...receipt.value, files })).length === 1;
    const links = receipt.value.links.filter((entry) => entry.path === relative);
    if (links.length > 0)
      return (yield* unchangedCopiedLinks(directory, { ...receipt.value, links })).length === 1;
    const entry = receipt.value.directories.find((entry) => entry.path === relative);
    if (entry === undefined) return false;
    const observed = yield* resolveObservedNativeEntry(target);
    const address = observed.address;
    if (address.kind !== "directory" || address.entryPath !== target) return false;
    const identity = observedIdentity(observed);
    return Option.isSome(identity) && sameIdentity(identity.value, entry.identity);
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/**
 * A replacement requires the complete old copy to remain owned, with no foreign additions.
 * The receipt is one the caller just read with no filesystem work since; every entry is
 * observed live here.
 */
export const copiedDirectoryCanReplaceWith = (directory: string, receipt: CopiedDirectoryReceipt) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (
      (yield* unchangedCopiedFiles(directory, receipt)).length !== receipt.files.length ||
      (yield* unchangedCopiedLinks(directory, receipt)).length !== receipt.links.length
    )
      return false;
    const expected = new Set([
      ...receipt.files.map((entry) => entry.path),
      ...receipt.links.map((entry) => entry.path),
      ...receipt.directories.map((entry) => entry.path),
    ]);
    const pending = [""];
    let observed = 0;
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(directory, relative))) {
        const child = path.join(relative, name);
        if (!expected.has(child)) return false;
        observed += 1;
        const expectedDirectory = receipt.directories.find((entry) => entry.path === child);
        if (expectedDirectory === undefined) continue;
        const absolute = path.join(directory, child);
        const entry = yield* resolveObservedNativeEntry(absolute);
        if (entry.address.kind !== "directory" || entry.address.entryPath !== absolute)
          return false;
        const identity = observedIdentity(entry);
        if (Option.isNone(identity) || !sameIdentity(identity.value, expectedDirectory.identity))
          return false;
        pending.push(child);
      }
    }
    return observed === expected.size;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** A replacement requires the complete old copy to remain owned, with no foreign additions. */
export const copiedDirectoryCanReplace = (directory: string) =>
  Effect.gen(function* () {
    const receipt = yield* readCopiedDirectory(directory);
    return (
      Option.isSome(receipt) && (yield* copiedDirectoryCanReplaceWith(directory, receipt.value))
    );
  });

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
    for (const link of yield* unchangedCopiedLinks(directory, receipt.value)) {
      const target = path.join(directory, link.path);
      yield* remove === undefined ? fs.remove(target) : remove(target);
    }
    for (const entry of [...receipt.value.directories].sort(
      (a, b) => b.path.length - a.path.length,
    )) {
      const child = path.join(directory, entry.path);
      const observed = yield* resolveObservedNativeEntry(child);
      const address = observed.address;
      if (address.kind !== "directory" || address.entryPath !== child) continue;
      const identity = observedIdentity(observed);
      if (
        Option.isSome(identity) &&
        sameIdentity(identity.value, entry.identity) &&
        (yield* fs.readDirectory(child)).length === 0
      ) {
        yield* remove === undefined ? fs.remove(child, { recursive: true }) : remove(child);
      }
    }
    const receiptPath = yield* copiedDirectoryReceiptPath(directory);
    yield* remove === undefined ? fs.remove(receiptPath) : remove(receiptPath);
    if ((yield* fs.readDirectory(directory)).length === 0) {
      yield* remove === undefined ? fs.remove(directory, { recursive: true }) : remove(directory);
    }
    return true;
  });

/**
 * Repeated synchronization does not rewrite a current bounded copy or its foreign siblings.
 * The receipt is one the caller just read with no filesystem work since; every entry and the
 * source tree are observed live here.
 */
export const copiedDirectoryIsCurrentWith = (
  directory: string,
  receipt: CopiedDirectoryReceipt,
  source: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (receipt.source !== source) return false;
    for (const entry of receipt.directories) {
      const absolute = path.join(directory, entry.path);
      const observed = yield* resolveObservedNativeEntry(absolute);
      const address = observed.address;
      if (address.kind !== "directory" || address.entryPath !== absolute) return false;
      const identity = observedIdentity(observed);
      if (Option.isNone(identity) || !sameIdentity(identity.value, entry.identity)) return false;
    }
    const currentFiles = yield* unchangedCopiedFiles(directory, receipt);
    if (currentFiles.length !== receipt.files.length) return false;
    if ((yield* unchangedCopiedLinks(directory, receipt)).length !== receipt.links.length)
      return false;
    const expectedFiles = new Map(receipt.files.map((file) => [file.path, file]));
    const expectedLinks = new Map(receipt.links.map((link) => [link.path, link.target]));
    const expectedDirectories = new Set(receipt.directories.map((entry) => entry.path));
    const validateContainedLink = containedLinkValidator(source);
    const pending = [""];
    let seen = 0;
    const total = expectedFiles.size + expectedLinks.size + expectedDirectories.size;
    while (pending.length > 0) {
      const relative = pending.pop();
      if (relative === undefined) break;
      for (const name of yield* fs.readDirectory(path.join(source, relative))) {
        if (name === ".git") continue;
        if (++seen > total) return false;
        const child = path.join(relative, name);
        const absolute = path.join(source, child);
        const link = yield* fs.readLink(absolute).pipe(Effect.option);
        if (Option.isSome(link)) {
          yield* validateContainedLink(absolute, link.value);
          if (expectedLinks.get(child) !== link.value) return false;
          continue;
        }
        const info = yield* fs.stat(absolute);
        if (info.type === "Directory") {
          if (!expectedDirectories.has(child)) return false;
          pending.push(child);
        } else {
          const expected = expectedFiles.get(child);
          if (
            expected === undefined ||
            (info.mode & 0o111) !== (expected.identity.mode & 0o111) ||
            sha512Integrity(yield* fs.readFile(absolute)) !== expected.integrity
          )
            return false;
        }
      }
    }
    return seen === total;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** Repeated synchronization does not rewrite a current bounded copy or its foreign siblings. */
export const copiedDirectoryIsCurrent = (directory: string, source: string) =>
  Effect.gen(function* () {
    const receipt = yield* readCopiedDirectory(directory);
    return (
      Option.isSome(receipt) &&
      (yield* copiedDirectoryIsCurrentWith(directory, receipt.value, source))
    );
  });
