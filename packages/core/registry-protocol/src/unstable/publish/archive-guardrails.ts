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

const COMPRESSION_STORE = 0;
const COMPRESSION_DEFLATE = 8;
const SUPPORTED_COMPRESSION = new Set([COMPRESSION_STORE, COMPRESSION_DEFLATE]);

const S_IFLNK = 0xa000;
const S_IFMT = 0xf000;

const textDecoder = new TextDecoder();

export interface ZipEntry {
  readonly fileName: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly externalAttributes: number;
  readonly localHeaderOffset: number;
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

const findEocdOffset = (buf: Uint8Array): Effect.Effect<number, ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const minOffset = Math.max(0, buf.length - 22 - 65535);
    for (let i = buf.length - 22; i >= minOffset; i--) {
      if (view.getUint32(i, true) === ZIP_EOCD_SIGNATURE) {
        return i;
      }
    }
    return yield* new ArchiveGuardrailError({
      code: "malformed_archive",
      message: "ZIP end-of-central-directory record not found.",
    });
  });

export const parseZipCentralDirectory = (
  buf: Uint8Array,
): Effect.Effect<readonly ZipEntry[], ArchiveGuardrailError> =>
  Effect.gen(function* () {
    if (buf.length < 22) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: "Archive too small to be a valid ZIP file.",
      });
    }

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.getUint32(0, true) !== ZIP_LOCAL_SIGNATURE) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: "Archive does not start with a valid ZIP local file header signature.",
      });
    }

    const eocdOffset = yield* findEocdOffset(buf);

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdirSize = view.getUint32(eocdOffset + 12, true);
    const cdirOffset = view.getUint32(eocdOffset + 16, true);

    if (cdirOffset + cdirSize > buf.length) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: "Central directory offset and size exceed archive bounds.",
      });
    }

    const entries: ZipEntry[] = [];
    let offset = cdirOffset;

    for (let i = 0; i < totalEntries; i++) {
      if (offset + 46 > buf.length) {
        return yield* new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `Central directory entry ${i} exceeds archive bounds.`,
        });
      }

      const signature = view.getUint32(offset, true);
      if (signature !== ZIP_CDIR_SIGNATURE) {
        return yield* new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `Invalid central directory entry signature at offset ${offset}.`,
        });
      }

      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraFieldLength = view.getUint16(offset + 30, true);
      const fileCommentLength = view.getUint16(offset + 32, true);
      const externalAttributes = view.getUint32(offset + 38, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > buf.length) {
        return yield* new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `File name for entry ${i} exceeds archive bounds.`,
        });
      }

      const fileName = textDecoder.decode(buf.slice(fileNameStart, fileNameEnd));

      entries.push({
        fileName,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        externalAttributes,
        localHeaderOffset,
      });

      offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    return entries;
  });

const checkPathTraversal = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    const normalized = entry.fileName.replace(/\\/g, "/");
    if (normalized.includes("../") || normalized.includes("/..") || normalized === "..") {
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
    const normalized = entry.fileName.toLowerCase();
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

const checkSymlinks = (
  entries: readonly ZipEntry[],
): Effect.Effect<void, ArchiveGuardrailError> => {
  for (const entry of entries) {
    const unixMode = entry.externalAttributes >>> 16;
    if ((unixMode & S_IFMT) === S_IFLNK) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "symlink_entry",
          message: `Archive contains symlink entry: "${entry.fileName}".`,
          entry: entry.fileName,
        }),
      );
    }
  }

  return Effect.void;
};

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
    yield* checkSymlinks(entries);
    yield* checkCompressionMethods(entries);
    yield* checkEntryCount(entries, appliedLimits);
    yield* checkDecompressedSize(entries, appliedLimits);
    yield* checkCompressionRatio(entries, appliedLimits);

    return entries;
  });
