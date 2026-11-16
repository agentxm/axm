import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import { validateContainedLink } from "../../locations/index.js";
import * as crypto from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import { framePackageContentEntry } from "./package-hash.js";
import { computeSourceHash } from "./rendered-files.js";

const TREE_INTEGRITY_PREFIX = "sha256-tree-v2:";

export const TreeIntegritySchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^sha256-tree-v2:[0-9a-f]{64}(?![\s\S])/u, {
      message: "Expected a sha256-tree-v2 materialized-tree digest",
    }),
  ),
  Schema.brand("TreeIntegrity"),
).annotate({
  identifier: "TreeIntegrity",
  description:
    "Strict SHA-256 integrity of paths, entry kinds, file bytes, executable bits, and contained link targets using AXM materialized-tree framing v2.",
});

export type TreeIntegrity = Schema.Schema.Type<typeof TreeIntegritySchema>;

const decodeTreeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema);

/**
 * A materialized package tree failed strict integrity walking: unreadable,
 * unsafe, colliding, or unsupported entries. `reason` carries the walk's fact
 * sentence.
 */
export class MaterializedTreeInvalid extends Data.TaggedError("MaterializedTreeInvalid")<{
  readonly root: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

const treeError = (root: string, reason: string, cause?: unknown): MaterializedTreeInvalid =>
  new MaterializedTreeInvalid({ root, reason, ...(cause === undefined ? {} : { cause }) });

const frame = (hash: crypto.Hash, bytes: Uint8Array): void => {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
};

type MaterializedEntry =
  | {
      readonly kind: "file";
      readonly relativePath: string;
      readonly absolutePath: string;
      readonly executable: number;
    }
  | { readonly kind: "directory"; readonly relativePath: string }
  | { readonly kind: "symlink"; readonly relativePath: string; readonly target: string };

export interface MaterializedTreeIntegrityOptions {
  /** Include one file or link in the digest. Directories are always traversed. */
  readonly includeFile?: (relativePath: string) => boolean;
}

/** One walked entry with the payload bytes its package content frame carries. */
interface PackageContentEntry {
  /** `directory`, `symlink`, or `file:<executable bits>`. */
  readonly kind: string;
  readonly relativePath: string;
  readonly payload: Uint8Array;
}

/**
 * The strict walk and digest. When `retainPayloads` is set, each hashed entry
 * also comes back with the bytes it was hashed from, for one caller to frame
 * a second digest without reading the tree again. When `retainText` names the
 * exact path the walk reads a regular file at, that file's bytes also come
 * back decoded as `readFileString` decodes them, unless decoding fails. When
 * `captureWalk` is set, the walk also comes back as it observed it.
 */
const strictTreeDigest = (
  root: string,
  options: MaterializedTreeIntegrityOptions,
  retainPayloads: boolean,
  retainText?: ReadonlySet<string>,
  captureWalk?: boolean,
): Effect.Effect<
  {
    readonly integrity: TreeIntegrity;
    readonly entries: ReadonlyArray<PackageContentEntry>;
    readonly texts?: ReadonlyMap<string, string>;
    readonly walk?: CapturedTreeWalk;
  },
  MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: MaterializedEntry[] = [];
    const caseFoldedPaths = new Map<string, string>();
    const captured =
      captureWalk === true
        ? {
            names: new Map<string, ReadonlyArray<string>>(),
            facts: new Map<string, Map<string, WalkedEntryFacts>>(),
            bytes: new Map<string, Uint8Array>(),
          }
        : undefined;
    // Captured listings are keyed as a platform-joined relative directory.
    const listingKey = (relativeDirectory: string) =>
      relativeDirectory === "" ? "" : path.join(...relativeDirectory.split("/"));

    const walk = (
      directory: string,
      relativeDirectory: string,
    ): Effect.Effect<void, MaterializedTreeInvalid, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const entries = yield* fs
          .readDirectory(directory)
          .pipe(
            Effect.mapError((cause) =>
              treeError(root, `cannot read ${relativeDirectory || "."}`, cause),
            ),
          );
        const ordered = [...entries].sort((left, right) => left.localeCompare(right, "en"));
        const listedFacts = new Map<string, WalkedEntryFacts>();
        if (captured !== undefined) {
          captured.names.set(listingKey(relativeDirectory), Object.freeze([...entries]));
          captured.facts.set(listingKey(relativeDirectory), listedFacts);
        }
        for (const entry of ordered) {
          if (
            entry.length === 0 ||
            entry === "." ||
            entry === ".." ||
            entry.includes("/") ||
            entry.includes("\\")
          ) {
            return yield* treeError(root, `unsafe path segment ${JSON.stringify(entry)}`);
          }
          const relativePath =
            relativeDirectory.length === 0 ? entry : `${relativeDirectory}/${entry}`;
          if (relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
            return yield* treeError(root, `unsafe relative path ${JSON.stringify(relativePath)}`);
          }
          const folded = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
          const colliding = caseFoldedPaths.get(folded);
          if (colliding !== undefined && colliding !== relativePath) {
            return yield* treeError(
              root,
              `case-fold collision between ${JSON.stringify(colliding)} and ${JSON.stringify(relativePath)}`,
            );
          }
          caseFoldedPaths.set(folded, relativePath);

          const absolutePath = path.join(directory, entry);
          const info = yield* fs
            .lstat(absolutePath)
            .pipe(
              Effect.mapError((cause) => treeError(root, `cannot inspect ${relativePath}`, cause)),
            );
          if (info.type === "SymbolicLink") {
            const target = yield* fs
              .readLink(absolutePath)
              .pipe(
                Effect.mapError((cause) =>
                  treeError(root, `cannot read symlink: ${relativePath}`, cause),
                ),
              );
            yield* validateContainedLink(root, absolutePath, target).pipe(
              Effect.mapError((cause) => treeError(root, `unsafe symlink: ${relativePath}`, cause)),
            );
            if (captured !== undefined)
              listedFacts.set(entry, Object.freeze({ kind: "link", target }));
            if (options.includeFile?.(relativePath) !== false)
              files.push({ kind: "symlink", relativePath, target });
            continue;
          }
          if (captured !== undefined)
            listedFacts.set(
              entry,
              Object.freeze({ kind: "entry", type: info.type, mode: info.mode }),
            );
          if (info.type === "Directory") {
            files.push({ kind: "directory", relativePath });
            yield* walk(absolutePath, relativePath);
          } else if (info.type === "File") {
            if (options.includeFile?.(relativePath) !== false) {
              files.push({
                kind: "file",
                relativePath,
                absolutePath,
                executable: info.mode & 0o111,
              });
            }
          } else {
            return yield* treeError(root, `unsupported filesystem entry: ${relativePath}`);
          }
        }
      });

    yield* walk(root, "");
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
    const hash = crypto.createHash("sha256");
    let payloadBytes = 0;
    let hashedEntries = 0;
    const entries: PackageContentEntry[] = [];
    const texts = retainText === undefined ? undefined : new Map<string, string>();
    const retain = (kind: string, relativePath: string, payload: Uint8Array): void => {
      if (retainPayloads) entries.push({ kind, relativePath, payload });
    };
    frame(hash, Buffer.from("agentxm-materialized-tree"));
    frame(hash, Buffer.from("2"));
    yield* Effect.gen(function* () {
      for (const file of files) {
        hashedEntries += 1;
        frame(hash, Buffer.from(file.kind));
        frame(hash, Buffer.from(file.relativePath, "utf8"));
        if (file.kind === "directory") {
          retain("directory", file.relativePath, new Uint8Array());
          continue;
        }
        if (file.kind === "symlink") {
          const target = Buffer.from(file.target, "utf8");
          payloadBytes += target.byteLength;
          frame(hash, target);
          retain("symlink", file.relativePath, new TextEncoder().encode(file.target));
          continue;
        }
        frame(hash, Buffer.from(String(file.executable)));
        const content = yield* fs
          .readFile(file.absolutePath)
          .pipe(
            Effect.mapError((cause) => treeError(root, `cannot read ${file.relativePath}`, cause)),
          );
        payloadBytes += content.byteLength;
        frame(hash, content);
        retain(`file:${file.executable}`, file.relativePath, content);
        // A distribution never reads Git administration, so its bytes are not kept.
        if (captured !== undefined && !file.relativePath.split("/").includes(".git"))
          captured.bytes.set(file.relativePath, content);
        if (texts !== undefined && retainText?.has(file.absolutePath) === true) {
          const text = decodedText(content);
          if (text !== undefined) texts.set(file.absolutePath, text);
        }
      }
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() =>
          annotateWork({
            "axm.work.count": hashedEntries,
            "axm.work.bytes": payloadBytes,
          }),
        ),
      ),
    );
    return {
      integrity: decodeTreeIntegrity(`${TREE_INTEGRITY_PREFIX}${hash.digest("hex")}`),
      entries,
      ...(texts === undefined ? {} : { texts }),
      ...(captured === undefined
        ? {}
        : {
            walk: Object.freeze({
              names: (relativeDirectory: string) => captured.names.get(relativeDirectory),
              facts: (relativeDirectory: string, name: string) =>
                captured.facts.get(relativeDirectory)?.get(name),
              bytes: (relativePath: string) => {
                // A copy: a Node buffer's `slice` would share the read bytes.
                const read = captured.bytes.get(relativePath);
                return read === undefined ? undefined : new Uint8Array(read);
              },
            }),
          }),
    };
  });

/** What a strict walk observed of one listed entry, without following it. */
type WalkedEntryFacts =
  | { readonly kind: "link"; readonly target: string }
  | ({ readonly kind: "entry" } & Pick<FileSystem.File.Info, "type" | "mode">);

/**
 * One strict walk of a tree as it observed it: each directory's names in
 * listing order, keyed by the directory's path relative to the root ("" for
 * the root, joined with the platform separator), what it observed of each
 * entry, and a copy of the bytes it read of each regular file outside Git
 * administration, by its "/"-joined relative path.
 */
export interface CapturedTreeWalk {
  readonly names: (relativeDirectory: string) => ReadonlyArray<string> | undefined;
  readonly facts: (relativeDirectory: string, name: string) => WalkedEntryFacts | undefined;
  readonly bytes: (relativePath: string) => Uint8Array | undefined;
}

/**
 * The strict walk of `computeMaterializedTreeIntegrity`, also returning the
 * walk as it observed it, for one caller that digests the same tree again
 * within the same read phase. Its failures, their order and its work
 * observation are those of `computeMaterializedTreeIntegrity`.
 */
export const computeMaterializedTreeIntegrityWalking = (
  root: string,
): Effect.Effect<
  { readonly integrity: TreeIntegrity; readonly walk: Option.Option<CapturedTreeWalk> },
  MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  strictTreeDigest(root, {}, false, undefined, true).pipe(
    Effect.map(({ integrity, walk }) => ({ integrity, walk: Option.fromUndefinedOr(walk) })),
    (effect) => withWork("axm.hash.materialized-tree", effect),
  );

/** The text `readFileString` without an encoding yields for `bytes`, or `undefined` where it fails. */
const decodedText = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
};

/** Text of regular files one strict walk read, by the exact path it read them at. */
export interface WalkedFileText {
  /** The decoded text of the regular file the walk read at exactly `absolutePath`, if any. */
  readonly text: (absolutePath: string) => Option.Option<string>;
}

/**
 * The strict walk of `computeMaterializedTreeIntegrity`, also keeping the
 * text of the regular files it reads at exactly the paths in `readPaths`,
 * each joined from `root` with the same path service. Its failures, their
 * order and its work observation are those of
 * `computeMaterializedTreeIntegrity`. A path that is a link, a directory, or
 * absent under that exact spelling has no text; the text stays local to the
 * returned lookup.
 */
export const computeMaterializedTreeIntegrityReading = (
  root: string,
  readPaths: ReadonlyArray<string>,
): Effect.Effect<
  { readonly integrity: TreeIntegrity; readonly read: WalkedFileText },
  MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  strictTreeDigest(root, {}, false, new Set(readPaths)).pipe(
    Effect.map(({ integrity, texts }) => ({
      integrity,
      read: Object.freeze({
        text: (absolutePath: string) => Option.fromUndefinedOr(texts?.get(absolutePath)),
      }),
    })),
    (effect) => withWork("axm.hash.materialized-tree", effect),
  );

export const computeMaterializedTreeIntegrity = (
  root: string,
  options: MaterializedTreeIntegrityOptions = {},
): Effect.Effect<TreeIntegrity, MaterializedTreeInvalid, FileSystem.FileSystem | Path.Path> =>
  strictTreeDigest(root, options, false).pipe(
    Effect.map(({ integrity }) => integrity),
    (effect) => withWork("axm.hash.materialized-tree", effect),
  );

/**
 * Package content order: each directory's entries in code-unit order, each
 * directory followed by its descendants. Comparing paths segment by segment
 * yields exactly that depth-first order.
 */
const byPackagePathOrder = (left: PackageContentEntry, right: PackageContentEntry): number => {
  const leftSegments = left.relativePath.split("/");
  const rightSegments = right.relativePath.split("/");
  for (let index = 0; index < Math.min(leftSegments.length, rightSegments.length); index += 1) {
    const leftSegment = leftSegments[index] ?? "";
    const rightSegment = rightSegments[index] ?? "";
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return leftSegments.length - rightSegments.length;
};

/** The package content hash framing of `computePackageContentHash`, over already-read entries. */
const packageContentHashOf = (entries: ReadonlyArray<PackageContentEntry>) =>
  Effect.suspend(() => {
    const hash = crypto.createHash("sha256");
    let byteCount = 0;
    for (const entry of [...entries].sort(byPackagePathOrder)) {
      byteCount += entry.payload.byteLength;
      framePackageContentEntry(hash, entry.kind, entry.relativePath, entry.payload);
    }
    return annotateWork({ "axm.work.bytes": byteCount, "axm.work.count": entries.length }).pipe(
      Effect.andThen(computeSourceHash(hash.digest("hex"))),
    );
  }).pipe((effect) => withWork("axm.hash.package", effect));

/**
 * The materialized-tree integrity and the package content hash of one root,
 * from one strict walk and one read of each file. The strict walk's failures
 * and their order are those of `computeMaterializedTreeIntegrity`; once it has
 * succeeded, the package hash equals `computePackageContentHash` of the same
 * bytes. The read bytes stay local to this call.
 */
export const computeMaterializedTreeDigests = (
  root: string,
): Effect.Effect<
  { readonly treeIntegrity: TreeIntegrity; readonly contentHash: SourceHash },
  MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const walked = yield* strictTreeDigest(root, {}, true).pipe((effect) =>
      withWork("axm.hash.materialized-tree", effect),
    );
    return {
      treeIntegrity: walked.integrity,
      contentHash: yield* packageContentHashOf(walked.entries),
    };
  });

/**
 * The strict walk of `computeMaterializedTreeIntegrity`, for a caller that
 * judges the walked tree against the `expected` integrity. When `frame` is
 * set and the walked integrity is the expected one, the package content hash
 * of the same bytes is framed as `computeMaterializedTreeDigests` frames it;
 * otherwise no package hash is framed and no bytes are kept. The walk's
 * failures are those of `computeMaterializedTreeIntegrity`, and the read
 * bytes stay local to this call.
 */
export const computeMaterializedTreeDigestsMatching = (
  root: string,
  expected: TreeIntegrity,
  frame: boolean,
): Effect.Effect<
  { readonly treeIntegrity: TreeIntegrity; readonly contentHash: Option.Option<SourceHash> },
  MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const walked = yield* strictTreeDigest(root, {}, frame).pipe((effect) =>
      withWork("axm.hash.materialized-tree", effect),
    );
    return {
      treeIntegrity: walked.integrity,
      contentHash:
        frame && walked.integrity === expected
          ? Option.some(yield* packageContentHashOf(walked.entries))
          : Option.none<SourceHash>(),
    };
  });
