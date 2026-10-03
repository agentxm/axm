// @effect-diagnostics nodeBuiltinImport:off — bounded gzip decompression uses the platform codec
import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { parseZipCentralDirectory } from "@agentxm/extension-content";
import {
  extractZip,
  type ArchiveExtractionLimits,
  MAX_ARCHIVE_ENTRIES,
  MAX_BUFFERED_ARCHIVE_BYTES,
  MAX_EXTRACTED_ARCHIVE_BYTES,
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

const invalid = (detail: string, cause?: unknown) => new ExternalArchiveInvalid({ detail, cause });

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

const decodeTar = (bytes: Uint8Array, limits: Required<ArchiveExtractionLimits>) =>
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

/** Extract unchanged ZIP/tar payloads into a caller-owned empty staging directory. */
export const extractExternalArchive = (
  bytes: Uint8Array,
  format: "zip" | "tar" | "tar.gz",
  directory: string,
  options: ArchiveExtractionLimits = {},
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
    if (format === "zip") {
      const inventory = yield* parseZipCentralDirectory(bytes);
      const decoded: ArchiveEntry[] = [];
      for (const entry of inventory) {
        const mode = entry.externalAttributes >>> 16;
        const kind = mode & 0o170000;
        if (![0, 0o100000, 0o040000, 0o120000].includes(kind))
          return yield* invalid(`Unsupported ZIP entry kind: ${entry.fileName}`);
        if (
          (kind === 0o040000 && !entry.fileName.endsWith("/")) ||
          (kind === 0o120000 && entry.fileName.endsWith("/"))
        )
          return yield* invalid(`Inconsistent ZIP entry kind: ${entry.fileName}`);
        decoded.push({
          name: entry.fileName,
          kind: kind === 0o120000 ? "symlink" : entry.fileName.endsWith("/") ? "directory" : "file",
          mode: mode === 0 ? (entry.fileName.endsWith("/") ? 0o755 : 0o644) : mode & 0o777,
        });
      }
      entries = decoded;
    } else {
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
    }
    yield* validateEntries(entries, limits.maxEntries);
    if (format === "zip") yield* extractZip(bytes, directory, limits);
    else
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
        const value =
          format === "zip"
            ? yield* fs.readFile(target).pipe(
                Effect.flatMap((bytes) =>
                  Effect.try({
                    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                    catch: (cause) => invalid("Invalid link target encoding", cause),
                  }),
                ),
              )
            : entry.link;
        if (value === undefined || value.length === 0)
          return yield* invalid("Missing archive link target");
        yield* validateContainedLink(directory, target, value);
        if (format === "zip") yield* fs.remove(target);
        yield* fs.symlink(value, target);
      }
    }
    // Resolve again after all links exist: chained links cannot bypass containment.
    for (const entry of entries)
      if (entry.kind === "symlink") {
        const target = path.join(directory, entry.name);
        yield* validateContainedLink(directory, target, yield* fs.readLink(target));
      }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ExternalArchiveInvalid
        ? cause
        : invalid("Archive payload could not be extracted", cause),
    ),
  );
