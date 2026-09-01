import * as crypto from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const TREE_INTEGRITY_PREFIX = "sha256-tree-v1:";

export const TreeIntegritySchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      /^sha256-tree-v1:[0-9a-f]{64}$/u.test(value)
        ? undefined
        : "Expected a sha256-tree-v1 materialized-tree digest",
    ),
  ),
  Schema.brand("TreeIntegrity"),
).annotate({
  identifier: "TreeIntegrity",
  description:
    "Strict SHA-256 integrity of regular-file paths and bytes using AXM materialized-tree framing v1.",
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

interface MaterializedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
}

export const computeMaterializedTreeIntegrity = (
  root: string,
): Effect.Effect<TreeIntegrity, MaterializedTreeInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: MaterializedFile[] = [];
    const caseFoldedPaths = new Map<string, string>();

    const walk = (
      directory: string,
      relativeDirectory: string,
    ): Effect.Effect<void, MaterializedTreeInvalid> =>
      Effect.gen(function* () {
        const entries = yield* fs
          .readDirectory(directory)
          .pipe(
            Effect.mapError((cause) =>
              treeError(root, `cannot read ${relativeDirectory || "."}`, cause),
            ),
          );
        const ordered = [...entries].sort((left, right) => left.localeCompare(right, "en"));
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
          const link = yield* fs.readLink(absolutePath).pipe(Effect.option);
          if (Option.isSome(link)) {
            return yield* treeError(root, `symlink is not allowed: ${relativePath}`);
          }
          const info = yield* fs
            .stat(absolutePath)
            .pipe(
              Effect.mapError((cause) => treeError(root, `cannot inspect ${relativePath}`, cause)),
            );
          if (info.type === "Directory") {
            yield* walk(absolutePath, relativePath);
          } else if (info.type === "File") {
            files.push({ relativePath, absolutePath });
          } else {
            return yield* treeError(root, `unsupported filesystem entry: ${relativePath}`);
          }
        }
      });

    yield* walk(root, "");
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
    const hash = crypto.createHash("sha256");
    frame(hash, Buffer.from("agentxm-materialized-tree"));
    frame(hash, Buffer.from("1"));
    for (const file of files) {
      frame(hash, Buffer.from(file.relativePath, "utf8"));
      frame(
        hash,
        yield* fs
          .readFile(file.absolutePath)
          .pipe(
            Effect.mapError((cause) => treeError(root, `cannot read ${file.relativePath}`, cause)),
          ),
      );
    }
    return decodeTreeIntegrity(`${TREE_INTEGRITY_PREFIX}${hash.digest("hex")}`);
  });
