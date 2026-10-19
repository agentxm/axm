// @effect-diagnostics nodeBuiltinImport:off — bounded gzip decompression uses the platform codec
import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import {
  type ArchiveGuardrailError,
  type ZipEntry,
  defaultReadEntry,
  parseZipCentralDirectory,
} from "@agentxm/extension-content";
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_BUFFERED_ARCHIVE_BYTES,
  MAX_EXTRACTED_ARCHIVE_BYTES,
  OperationExtractionBudget,
} from "@agentxm/registry-client";
import { validateContainedLink } from "../locations/index.js";

export class ExternalArchiveInvalid extends Data.TaggedError("ExternalArchiveInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

interface ArchiveEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink";
  readonly mode: number;
  readonly bytes?: Uint8Array;
  readonly link?: string;
}

interface ExternalArchiveLimits {
  readonly maxCompressedBytes?: number;
  readonly maxExpandedBytes?: number;
  readonly maxEntries?: number;
}

const invalid = (detail: string, cause?: unknown) => new ExternalArchiveInvalid({ detail, cause });

const unreadableZip = (cause: ArchiveGuardrailError) => invalid(cause.message, cause);

/** Validate the whole inventory before any package entry can become a filesystem link. */
const validateEntries = (entries: ReadonlyArray<ArchiveEntry>, maxEntries: number) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const names = new Map<string, ArchiveEntry>();
    const retained = new Map<string, string>();
    if (entries.length > maxEntries) return yield* invalid("Archive entry limit exceeded");
    for (const entry of entries) {
      const segments = entry.name.split("/");
      if (
        !entry.name ||
        entry.name.includes("\\") ||
        entry.name.includes("\0") ||
        path.isAbsolute(entry.name) ||
        /^[A-Za-z]:/.test(entry.name) ||
        segments.includes("..")
      )
        return yield* invalid(`Unsafe archive path: ${entry.name}`);
      const normalized = segments.filter((segment) => segment !== "." && segment !== "").join("/");
      if (!normalized && entry.kind !== "directory")
        return yield* invalid("Empty archive member path");
      if (!normalized) continue;
      const parts = normalized.split("/");
      for (let depth = 1; depth <= parts.length; depth++) {
        const prefix = parts.slice(0, depth).join("/");
        const key = prefix.normalize("NFC").toLocaleLowerCase("en-US");
        const prior = retained.get(key);
        if (prior !== undefined && prior !== prefix)
          return yield* invalid(`Case-fold collision in archive path: ${entry.name}`);
        retained.set(key, prefix);
        if (retained.size > maxEntries)
          return yield* invalid("Archive entry limit exceeded by implicit directories");
      }
      const folded = normalized.normalize("NFC").toLocaleLowerCase("en-US");
      if (names.has(folded)) return yield* invalid(`Duplicate archive path: ${entry.name}`);
      names.set(folded, entry);
    }
    for (const name of names.keys()) {
      const segments = name.split("/");
      for (let depth = 1; depth < segments.length; depth++) {
        const parent = segments.slice(0, depth).join("/");
        const ancestor = names.get(parent);
        if (ancestor !== undefined && ancestor.kind !== "directory")
          return yield* invalid(`Archive member traverses a non-directory entry: ${name}`);
      }
    }
  });

const decodeTar = (bytes: Uint8Array, limits: Required<ExternalArchiveLimits>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const parser = yield* Effect.acquireRelease(
        Effect.sync(() => extract()),
        (parser) =>
          Effect.sync(() => {
            parser.destroy();
          }),
      );
      // The async iterator observes this error too; the listener covers errors
      // emitted while the next entry's iterator is being attached.
      parser.on("error", () => undefined);
      yield* Effect.try({
        try: () => parser.end(bytes),
        catch: (cause) => invalid("Invalid tar archive", cause),
      });
      return yield* Stream.fromAsyncIterable(parser, (cause) =>
        invalid("Invalid tar archive", cause),
      ).pipe(
        Stream.runFoldEffect(
          (): { entries: ArchiveEntry[]; total: number } => ({ entries: [], total: 0 }),
          (state, body) =>
            Effect.gen(function* () {
              const { entries, total } = state;
              if (entries.length >= limits.maxEntries)
                return yield* invalid("Archive entry limit exceeded");
              const header = body.header;
              if (
                header.type !== "file" &&
                header.type !== "directory" &&
                header.type !== "symlink"
              )
                return yield* invalid(`Unsupported tar entry kind: ${header.type}`);
              if (
                !Number.isSafeInteger(header.size) ||
                header.size < 0 ||
                total + header.size > limits.maxExpandedBytes
              )
                return yield* invalid("Archive expanded-byte limit exceeded");
              const content = new Uint8Array(header.size);
              const bodyChunks: AsyncIterable<unknown> = body;
              const offset = yield* Stream.fromAsyncIterable(bodyChunks, (cause) =>
                invalid("Invalid tar entry", cause),
              ).pipe(
                Stream.runFoldEffect(
                  () => 0,
                  (offset, chunk) =>
                    Effect.gen(function* () {
                      if (
                        !(chunk instanceof Uint8Array) ||
                        offset + chunk.byteLength > content.byteLength
                      )
                        return yield* invalid("Tar entry differs from its declared size");
                      content.set(chunk, offset);
                      return offset + chunk.byteLength;
                    }),
                ),
              );
              if (offset !== header.size) return yield* invalid("Truncated tar entry");
              entries.push({
                name: header.name,
                kind: header.type,
                mode: header.mode & 0o777,
                ...(header.type === "symlink" ? { link: header.linkname } : { bytes: content }),
              });
              return { entries, total: total + offset };
            }),
        ),
        Effect.map(({ entries }) => entries),
      );
    }),
  );

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

/**
 * Bound the ZIP inventory by its declared sizes before inflating anything, then
 * inflate one entry at a time and require each to match its declaration.
 */
const decodeZip = (bytes: Uint8Array, limits: Required<ExternalArchiveLimits>) =>
  Effect.gen(function* () {
    const inventory = yield* parseZipCentralDirectory(bytes).pipe(Effect.mapError(unreadableZip));
    const declared: Array<{ readonly entry: ArchiveEntry; readonly zip: ZipEntry }> = [];
    let declaredBytes = 0;
    for (const zip of inventory) {
      const mode = zip.externalAttributes >>> 16;
      const kind = mode & S_IFMT;
      if (![0, S_IFREG, S_IFDIR, S_IFLNK].includes(kind))
        return yield* invalid(`Unsupported ZIP entry kind: ${zip.fileName}`);
      const directory = zip.fileName.endsWith("/");
      if ((kind === S_IFDIR && !directory) || (kind === S_IFLNK && directory))
        return yield* invalid(`Inconsistent ZIP entry kind: ${zip.fileName}`);
      declaredBytes += zip.uncompressedSize;
      if (declaredBytes > limits.maxExpandedBytes)
        return yield* invalid("Archive expanded-byte limit exceeded");
      declared.push({
        zip,
        entry: {
          name: zip.fileName,
          kind: kind === S_IFLNK ? "symlink" : directory ? "directory" : "file",
          mode: mode === 0 ? (directory ? 0o755 : 0o644) : mode & 0o777,
        },
      });
    }
    yield* validateEntries(
      declared.map(({ entry }) => entry),
      limits.maxEntries,
    );
    return yield* Effect.forEach(declared, ({ entry, zip }) =>
      entry.kind === "directory"
        ? Effect.succeed(entry)
        : Effect.gen(function* () {
            yield* Effect.yieldNow;
            const content = yield* defaultReadEntry(bytes, zip).pipe(
              Effect.mapError(unreadableZip),
            );
            if (content.byteLength !== zip.uncompressedSize)
              return yield* invalid(`ZIP entry differs from its declared size: ${zip.fileName}`);
            if (entry.kind === "file") return { ...entry, bytes: content };
            const link = yield* Effect.try({
              try: () => new TextDecoder("utf-8", { fatal: true }).decode(content),
              catch: (cause) => invalid("Invalid link target encoding", cause),
            });
            return { ...entry, link };
          }),
    );
  });

const extractArchive = (
  bytes: Uint8Array,
  format: "zip" | "tar" | "tar.gz",
  directory: string,
  options: ExternalArchiveLimits,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const limits = {
      maxCompressedBytes: Math.min(
        options.maxCompressedBytes ?? MAX_BUFFERED_ARCHIVE_BYTES,
        MAX_BUFFERED_ARCHIVE_BYTES,
      ),
      maxExpandedBytes: Math.min(
        options.maxExpandedBytes ?? MAX_EXTRACTED_ARCHIVE_BYTES,
        MAX_EXTRACTED_ARCHIVE_BYTES,
      ),
      maxEntries: Math.min(options.maxEntries ?? MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRIES),
    };
    if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1))
      return yield* invalid("Archive limits must be positive finite integers");
    if (bytes.byteLength > limits.maxCompressedBytes)
      return yield* invalid("Archive download-byte limit exceeded");
    if ((yield* fs.readDirectory(directory)).length !== 0)
      return yield* invalid("Archive staging directory must be empty");
    let entries: ReadonlyArray<ArchiveEntry>;
    if (format === "zip") entries = yield* decodeZip(bytes, limits);
    else {
      const expanded =
        format === "tar.gz"
          ? yield* Effect.try({
              try: () =>
                gunzipSync(bytes, {
                  maxOutputLength: limits.maxExpandedBytes + limits.maxEntries * 1024,
                }),
              catch: (cause) => invalid("Invalid or oversized gzip archive", cause),
            })
          : bytes;
      entries = yield* decodeTar(expanded, limits);
      yield* validateEntries(entries, limits.maxEntries);
    }
    // Every entry is decoded and checked before the first write.
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.kind === "directory") yield* fs.makeDirectory(target, { recursive: true });
      else {
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        if (entry.kind === "file" && entry.bytes !== undefined)
          yield* fs.writeFile(target, entry.bytes);
      }
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.kind === "file") yield* fs.chmod(target, entry.mode);
      if (entry.kind === "symlink") {
        if (entry.link === undefined || entry.link.length === 0)
          return yield* invalid("Missing archive link target");
        yield* validateContainedLink(directory, target, entry.link);
        yield* fs.symlink(entry.link, target);
      }
    }
    // Resolve again after all links exist: chained links cannot bypass containment.
    for (const entry of entries)
      if (entry.kind === "symlink") {
        const target = path.join(directory, entry.name);
        yield* validateContainedLink(directory, target, yield* fs.readLink(target));
      }
  });

/**
 * Extract unchanged ZIP/tar payloads into a caller-owned empty staging
 * directory, holding the operation's extraction permit when one is provided.
 */
export const extractExternalArchive = (
  bytes: Uint8Array,
  format: "zip" | "tar" | "tar.gz",
  directory: string,
  options: ExternalArchiveLimits = {},
) =>
  Effect.gen(function* () {
    const budget = yield* Effect.serviceOption(OperationExtractionBudget);
    const extraction = extractArchive(bytes, format, directory, options);
    return yield* Option.isSome(budget) ? budget.value.withExtraction(extraction) : extraction;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ExternalArchiveInvalid
        ? cause
        : invalid("Archive payload could not be extracted", cause),
    ),
  );
