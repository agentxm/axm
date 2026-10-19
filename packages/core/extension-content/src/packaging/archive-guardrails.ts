import { inflateRawSync } from "node:zlib";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export class ArchiveGuardrailError extends Data.TaggedError("ArchiveGuardrailError")<{
  readonly code:
    | "path_traversal"
    | "absolute_path"
    | "duplicate_entry"
    | "symlink_entry"
    | "unsupported_compression"
    | "malformed_archive"
    | "decompression_limit_exceeded"
    | "compression_ratio_exceeded"
    | "entry_count_exceeded"
    | "forbidden_entry";
  readonly message: string;
  readonly entry?: string;
}> {}

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CDIR_SIGNATURE = 0x02014b50;
export const ZIP_LOCAL_SIGNATURE = 0x04034b50;

const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_FILE_HEADER_SIZE = 30;
const MAX_ARCHIVE_COMMENT_BYTES = 0xffff;
// ZIP v1 fields saturated to these values defer to a ZIP64 record.
const ZIP64_COUNT_SENTINEL = 0xffff;
const ZIP64_SIZE_SENTINEL = 0xffffffff;
const FLAG_ENCRYPTED = 0x0001;

const COMPRESSION_STORE = 0;
const COMPRESSION_DEFLATE = 8;
const SUPPORTED_COMPRESSION = new Set([COMPRESSION_STORE, COMPRESSION_DEFLATE]);

// Bound target decoding and segment allocation separately from ordinary payload files.
const MAX_LINK_TARGET_BYTES = 64 * 1024;

const S_IFLNK = 0xa000;
const S_IFMT = 0xf000;

const textDecoder = new TextDecoder();

export interface ZipEntry {
  readonly fileName: string;
  /** Creator version; the high byte names the host system that wrote the attributes. */
  readonly versionMadeBy: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly externalAttributes: number;
  readonly localHeaderOffset: number;
  /** First byte of the entry's stored data, past its verified local header. */
  readonly localDataOffset: number;
}

export interface ArchiveGuardrailLimits {
  readonly maxEntries?: number;
  readonly maxDecompressedBytes?: number;
  readonly maxCompressionRatio?: number;
}

const DEFAULT_LIMITS: Required<ArchiveGuardrailLimits> = {
  maxEntries: 10_000,
  maxDecompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 100,
};

const malformed = (message: string, entry?: string) =>
  new ArchiveGuardrailError({
    code: "malformed_archive",
    message,
    ...(entry === undefined ? {} : { entry }),
  });

const bytesEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

/**
 * Locate the one end-of-central-directory record whose comment ends exactly at
 * the end of the archive. A second self-consistent record, such as one hidden
 * in the archive comment, makes the archive ambiguous between ZIP readers.
 */
const findEocdOffset = (
  buf: Uint8Array,
  view: DataView,
): Effect.Effect<number, ArchiveGuardrailError> => {
  const minOffset = Math.max(0, buf.length - EOCD_SIZE - MAX_ARCHIVE_COMMENT_BYTES);
  let found: number | undefined;
  for (let i = buf.length - EOCD_SIZE; i >= minOffset; i--) {
    if (
      view.getUint32(i, true) !== ZIP_EOCD_SIGNATURE ||
      i + EOCD_SIZE + view.getUint16(i + 20, true) !== buf.length
    ) {
      continue;
    }
    if (found !== undefined) {
      return Effect.fail(
        malformed("Archive contains more than one end-of-central-directory record."),
      );
    }
    found = i;
  }
  return found === undefined
    ? Effect.fail(malformed("ZIP end-of-central-directory record not found at the archive end."))
    : Effect.succeed(found);
};

/**
 * Read a single-disk ZIP v1 central directory and verify each entry's local
 * header against it, so every reader of the returned entries sees the same
 * names, methods and data ranges. Multi-disk, ZIP64 and encrypted archives are
 * rejected.
 */
export const parseZipCentralDirectory = (
  buf: Uint8Array,
): Effect.Effect<readonly ZipEntry[], ArchiveGuardrailError> =>
  Effect.gen(function* () {
    if (buf.length < EOCD_SIZE) {
      return yield* malformed("Archive too small to be a valid ZIP file.");
    }

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.getUint32(0, true) !== ZIP_LOCAL_SIGNATURE) {
      return yield* malformed(
        "Archive does not start with a valid ZIP local file header signature.",
      );
    }

    const eocdOffset = yield* findEocdOffset(buf, view);

    const diskNumber = view.getUint16(eocdOffset + 4, true);
    const cdirDisk = view.getUint16(eocdOffset + 6, true);
    const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdirSize = view.getUint32(eocdOffset + 12, true);
    const cdirOffset = view.getUint32(eocdOffset + 16, true);

    if (diskNumber !== 0 || cdirDisk !== 0 || entriesOnDisk !== totalEntries) {
      return yield* malformed("Multi-disk ZIP archives are not supported.");
    }
    if (
      totalEntries === ZIP64_COUNT_SENTINEL ||
      cdirSize === ZIP64_SIZE_SENTINEL ||
      cdirOffset === ZIP64_SIZE_SENTINEL
    ) {
      return yield* malformed("ZIP64 archives are not supported.");
    }
    if (cdirOffset + cdirSize !== eocdOffset) {
      return yield* malformed(
        "Central directory does not end at the end-of-central-directory record.",
      );
    }

    const entries: ZipEntry[] = [];
    let offset = cdirOffset;

    while (offset < eocdOffset) {
      const index = entries.length;
      if (offset + CENTRAL_HEADER_SIZE > eocdOffset) {
        return yield* malformed(`Central directory entry ${index} exceeds its declared bounds.`);
      }
      if (view.getUint32(offset, true) !== ZIP_CDIR_SIGNATURE) {
        return yield* malformed(`Invalid central directory entry signature at offset ${offset}.`);
      }

      const versionMadeBy = view.getUint16(offset + 4, true);
      const flags = view.getUint16(offset + 8, true);
      const compressionMethod = view.getUint16(offset + 10, true);
      const crc32 = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraFieldLength = view.getUint16(offset + 30, true);
      const fileCommentLength = view.getUint16(offset + 32, true);
      const externalAttributes = view.getUint32(offset + 38, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const fileNameStart = offset + CENTRAL_HEADER_SIZE;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > eocdOffset) {
        return yield* malformed(`File name for entry ${index} exceeds its declared bounds.`);
      }
      const fileNameBytes = buf.subarray(fileNameStart, fileNameEnd);
      const fileName = textDecoder.decode(fileNameBytes);

      if ((flags & FLAG_ENCRYPTED) !== 0) {
        return yield* malformed(
          `Encrypted ZIP entries are not supported: "${fileName}".`,
          fileName,
        );
      }
      if (
        compressedSize === ZIP64_SIZE_SENTINEL ||
        uncompressedSize === ZIP64_SIZE_SENTINEL ||
        localHeaderOffset === ZIP64_SIZE_SENTINEL
      ) {
        return yield* malformed(`ZIP64 entries are not supported: "${fileName}".`, fileName);
      }

      // Entry data precedes the central directory in a single-disk archive.
      if (
        localHeaderOffset + LOCAL_FILE_HEADER_SIZE > cdirOffset ||
        view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_SIGNATURE
      ) {
        return yield* malformed(`Invalid local file header for entry "${fileName}".`, fileName);
      }
      if ((view.getUint16(localHeaderOffset + 6, true) & FLAG_ENCRYPTED) !== 0) {
        return yield* malformed(
          `Encrypted ZIP entries are not supported: "${fileName}".`,
          fileName,
        );
      }
      if (view.getUint16(localHeaderOffset + 8, true) !== compressionMethod) {
        return yield* malformed(
          `Local and central compression methods disagree for entry "${fileName}".`,
          fileName,
        );
      }
      const localNameStart = localHeaderOffset + LOCAL_FILE_HEADER_SIZE;
      const localNameEnd = localNameStart + view.getUint16(localHeaderOffset + 26, true);
      const localDataOffset = localNameEnd + view.getUint16(localHeaderOffset + 28, true);
      if (
        localNameEnd > cdirOffset ||
        !bytesEqual(buf.subarray(localNameStart, localNameEnd), fileNameBytes)
      ) {
        return yield* malformed(
          `Local and central file names disagree for entry "${fileName}".`,
          fileName,
        );
      }
      if (localDataOffset + compressedSize > cdirOffset) {
        return yield* malformed(
          `Compressed data for entry "${fileName}" exceeds archive bounds.`,
          fileName,
        );
      }

      entries.push({
        fileName,
        versionMadeBy,
        crc32,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        externalAttributes,
        localHeaderOffset,
        localDataOffset,
      });

      offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    if (offset !== eocdOffset || entries.length !== totalEntries) {
      return yield* malformed(
        `Central directory holds ${entries.length} entries, but the archive declares ${totalEntries}.`,
      );
    }

    return entries;
  });

const INFLATE_CHUNK_SIZE = 16 * 1024;

export const defaultReadEntry = (
  archiveBytes: Uint8Array,
  entry: ZipEntry,
): Effect.Effect<Uint8Array, ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const { localDataOffset, compressedSize, compressionMethod, fileName } = entry;

    if (localDataOffset + compressedSize > archiveBytes.length) {
      return yield* malformed(
        `Compressed data for entry "${fileName}" exceeds archive bounds.`,
        fileName,
      );
    }

    const compressedData = archiveBytes.slice(localDataOffset, localDataOffset + compressedSize);

    if (compressionMethod === 0) {
      if (compressedData.byteLength !== entry.uncompressedSize) {
        return yield* new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `Stored entry size does not match its declaration: "${fileName}".`,
          entry: fileName,
        });
      }
      return compressedData;
    }

    if (compressionMethod === 8) {
      const expansionFailure = () =>
        new ArchiveGuardrailError({
          code: "decompression_limit_exceeded",
          message: `Entry "${fileName}" decompresses beyond its declared size of ${entry.uncompressedSize} bytes.`,
          entry: fileName,
        });
      // workerd grows its bounded zlib buffer by whole chunks, including the
      // final partial chunk. Reserve one chunk of codec headroom, then enforce
      // the exact declared size below. Expansion remains bounded during decode.
      const result = yield* Effect.try({
        try: () =>
          inflateRawSync(compressedData, {
            chunkSize: INFLATE_CHUNK_SIZE,
            maxOutputLength: entry.uncompressedSize + INFLATE_CHUNK_SIZE,
          }),
        catch: (error) => {
          const errorCode =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "";
          return errorCode === "ERR_BUFFER_TOO_LARGE" ||
            (error instanceof RangeError && error.message === "Memory limit exceeded")
            ? expansionFailure()
            : new ArchiveGuardrailError({
                code: "malformed_archive",
                message: `Failed to decompress entry "${fileName}".`,
                entry: fileName,
              });
        },
      });
      if (result.byteLength > entry.uncompressedSize) return yield* expansionFailure();
      return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    }

    return yield* new ArchiveGuardrailError({
      code: "unsupported_compression",
      message: `Unsupported compression method ${compressionMethod} for entry "${fileName}".`,
      entry: fileName,
    });
  });

const checkPathTraversal = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    const normalized = entry.fileName.replace(/\\/g, "/");
    if (normalized.split("/").includes("..")) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "path_traversal",
          message: `Archive entry contains path traversal: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

const checkAbsolutePaths = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    const normalized = entry.fileName.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "absolute_path",
          message: `Archive entry contains an absolute path: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

const checkDuplicateEntries = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = entry.fileName.replace(/\/$/, "").normalize("NFC").toLowerCase();
    if (seen.has(normalized)) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "duplicate_entry",
          message: `Archive contains duplicate entry: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }

    seen.add(normalized);
  }

  return Effect.void;
};

// Normalize only for portable identity comparisons; preserve original archive bytes.
const memberKey = (name: string) => name.normalize("NFC").toLowerCase();

const checkMemberTopology = (entries: readonly ZipEntry[]) =>
  Effect.gen(function* () {
    const members = new Map<string, ZipEntry>();
    for (const entry of entries) {
      const name = entry.fileName.replace(/\/$/, "");
      const kind = (entry.externalAttributes >>> 16) & S_IFMT;
      if (
        name.length === 0 ||
        /[\\\0:]/.test(name) ||
        name.split("/").some((part) => part === "" || part === "." || part === "..") ||
        ![0, 0x8000, 0x4000, S_IFLNK].includes(kind) ||
        (entry.fileName.endsWith("/") && kind !== 0 && kind !== 0x4000) ||
        (kind === 0x4000 && !entry.fileName.endsWith("/"))
      ) {
        return yield* new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `Archive entry has an ambiguous path or unsupported file kind: "${entry.fileName}".`,
          entry: entry.fileName,
        });
      }
      members.set(memberKey(name), entry);
    }
    for (const entry of entries) {
      const parts = entry.fileName.replace(/\/$/, "").split("/");
      parts.pop();
      while (parts.length > 0) {
        const ancestor = members.get(memberKey(parts.join("/")));
        if (
          ancestor !== undefined &&
          !ancestor.fileName.endsWith("/") &&
          ((ancestor.externalAttributes >>> 16) & S_IFMT) !== 0x4000
        ) {
          return yield* new ArchiveGuardrailError({
            code: "malformed_archive",
            message: `Archive entry is nested beneath a file or link: "${entry.fileName}".`,
            entry: entry.fileName,
          });
        }
        parts.pop();
      }
    }
  });

const checkSymlinks = (archiveBytes: Uint8Array, entries: readonly ZipEntry[]) =>
  Effect.gen(function* () {
    const targets = new Map<string, string>();
    for (const entry of entries) {
      if (((entry.externalAttributes >>> 16) & S_IFMT) !== S_IFLNK) continue;
      if (entry.uncompressedSize > MAX_LINK_TARGET_BYTES) {
        return yield* new ArchiveGuardrailError({
          code: "symlink_entry",
          entry: entry.fileName,
          message: `Archive link target exceeds the ${MAX_LINK_TARGET_BYTES}-byte validation limit: "${entry.fileName}".`,
        });
      }
      const bytes = yield* defaultReadEntry(archiveBytes, entry);
      const target = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        catch: () =>
          new ArchiveGuardrailError({
            code: "symlink_entry",
            message: `Archive link target is not UTF-8: "${entry.fileName}".`,
            entry: entry.fileName,
          }),
      });
      if (target.length === 0 || target.startsWith("/") || /[\\\0:]/.test(target)) {
        return yield* new ArchiveGuardrailError({
          code: "symlink_entry",
          message: `Archive link target must be a relative contained path: "${entry.fileName}".`,
          entry: entry.fileName,
        });
      }
      targets.set(memberKey(entry.fileName), target);
    }

    // Expand links before processing subsequent '..' segments, as a filesystem
    // does. Exit markers distinguish a cycle from a repeated finite traversal.
    // Bound total interpretation work independently of decompressed byte limits.
    let remainingSteps = 1_000_000;
    for (const [name, target] of targets) {
      const resolved = name.split("/").slice(0, -1);
      const pending: Array<string | { readonly leave: string }> = target.split("/").reverse();
      const active = new Set([name]);
      while (pending.length > 0) {
        if (--remainingSteps < 0) {
          return yield* new ArchiveGuardrailError({
            code: "symlink_entry",
            message: "Archive link resolution exceeds the bounded validation budget.",
            entry: name,
          });
        }
        const part = pending.pop();
        if (part === undefined) break;
        if (typeof part !== "string") {
          active.delete(part.leave);
          continue;
        }
        if (part === "" || part === ".") continue;
        if (part === "..") {
          if (resolved.length === 0) {
            return yield* new ArchiveGuardrailError({
              code: "symlink_entry",
              message: `Archive link escapes its package: "${name}".`,
              entry: name,
            });
          }
          resolved.pop();
          continue;
        }
        const next = memberKey([...resolved, part].join("/"));
        const nested = targets.get(next);
        if (nested === undefined) {
          resolved.push(part);
          continue;
        }
        // A cycle remains inert payload; a filesystem cannot traverse beyond it.
        if (active.has(next)) break;
        active.add(next);
        pending.push({ leave: next });
        for (const segment of nested.split("/").reverse()) pending.push(segment);
      }
    }
  });

const checkCompressionMethods = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    if (!SUPPORTED_COMPRESSION.has(entry.compressionMethod)) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "unsupported_compression",
          message: `Archive entry uses unsupported compression method ${entry.compressionMethod}: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

const checkEntryCount = (
  entries: readonly ZipEntry[],
  limits: Required<ArchiveGuardrailLimits>,
): Effect.Effect<void, ArchiveGuardrailError> =>
  entries.length > limits.maxEntries
    ? Effect.fail(
        new ArchiveGuardrailError({
          code: "entry_count_exceeded",
          message: `Archive contains ${entries.length} entries, exceeding the maximum allowed ${limits.maxEntries}.`,
        }),
      )
    : Effect.void;

const checkDecompressedSize = (
  entries: readonly ZipEntry[],
  limits: Required<ArchiveGuardrailLimits>,
): Effect.Effect<void, ArchiveGuardrailError> => {
  let totalUncompressed = 0;

  for (const entry of entries) {
    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > limits.maxDecompressedBytes) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "decompression_limit_exceeded",
          message: `Archive decompressed size exceeds maximum allowed ${limits.maxDecompressedBytes} bytes.`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

const checkCompressionRatio = (
  entries: readonly ZipEntry[],
  limits: Required<ArchiveGuardrailLimits>,
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    if (entry.compressedSize === 0) {
      if (entry.uncompressedSize > 0) {
        return Effect.fail(
          new ArchiveGuardrailError({
            code: "compression_ratio_exceeded",
            message: `Archive entry "${entry.fileName}" exceeds maximum compression ratio.`,
            entry: entry.fileName,
          }),
        );
      }
      continue;
    }

    const ratio = entry.uncompressedSize / entry.compressedSize;
    if (ratio > limits.maxCompressionRatio) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "compression_ratio_exceeded",
          message: `Archive entry "${entry.fileName}" exceeds maximum compression ratio ${limits.maxCompressionRatio}.`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

const FORBIDDEN_SEGMENTS = new Set(["node_modules", ".git"]);

/**
 * Reject archives carrying build or secret leftovers: any `node_modules` or
 * `.git` path segment, and `.env` / `.env.*` files. Kept out of
 * {@link validateArchive} on purpose — that function is the registry ingest
 * contract, and archives accepted by earlier clients must keep ingesting.
 *
 * `.env*` matches the basename exactly (`.env`) or by dotted prefix
 * (`.env.local`, `.env.production`, and also `.env.example`), so sibling names
 * like `.envrc` and `environment.md` are unaffected.
 */
export const checkForbiddenSourceEntries = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    const segments = entry.fileName.replace(/\\/g, "/").split("/");
    const basename = segments[segments.length - 1] ?? "";
    if (
      segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment)) ||
      basename === ".env" ||
      basename.startsWith(".env.")
    ) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "forbidden_entry",
          message: `Archive contains a forbidden entry: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

export const validateArchive = (
  archiveBytes: Uint8Array,
  limits?: ArchiveGuardrailLimits,
): Effect.Effect<readonly ZipEntry[], ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const appliedLimits = { ...DEFAULT_LIMITS, ...limits };
    const entries = yield* parseZipCentralDirectory(archiveBytes);

    yield* checkPathTraversal(entries);
    yield* checkAbsolutePaths(entries);
    yield* checkDuplicateEntries(entries);
    yield* checkCompressionMethods(entries);
    yield* checkEntryCount(entries, appliedLimits);
    yield* checkDecompressedSize(entries, appliedLimits);
    yield* checkCompressionRatio(entries, appliedLimits);
    yield* checkMemberTopology(entries);
    yield* checkSymlinks(archiveBytes, entries);

    return entries;
  });
